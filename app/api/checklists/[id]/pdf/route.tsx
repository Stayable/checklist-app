import { NextResponse } from "next/server";
import { GeofenceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canAccessProperty, isManagerOrAbove } from "@/lib/rbac";
import { presignDownload } from "@/lib/r2";
import { formatInET } from "@/lib/datetime";
import { roomDisplay } from "@/lib/room-label";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { ChecklistPdf, type PdfResponse } from "@/lib/pdf/ChecklistPdf";
import { answerToText } from "@/lib/pdf/answer-text";
import { formatMinutes, timeToCompleteMinutes } from "@/lib/review";
import { questionsForInstance } from "@/lib/template-version.server";

// Node runtime required — react-pdf uses Node APIs.
export const runtime = "nodejs";

const GEO_LABEL: Record<GeofenceStatus, string> = {
  [GeofenceStatus.VERIFIED]: "On property",
  [GeofenceStatus.OFF_PROPERTY]: "Off property",
  [GeofenceStatus.NO_GPS]: "No GPS",
  [GeofenceStatus.UNVERIFIED]: "No geofence",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth: use raw auth() — requireUser/requireManager redirect, which is wrong
  // for an API route. Return 401/403 JSON instead.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const instance = await db.checklistInstance.findUnique({
    where: { id },
    include: {
      template: { select: { name: true } },
      property: {
        select: { id: true, shortCode: true, name: true, propertyId: true },
      },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { name: true } },
      // Named on the export so a paper copy says who signed it off, not just
      // that somebody did.
      reviewedBy: { select: { name: true } },
      responses: {
        include: {
          photos: {
            orderBy: { createdAt: "asc" },
            select: {
              r2Key: true,
              geofenceStatus: true,
              capturedAt: true,
              gpsLat: true,
              gpsLng: true,
            },
          },
        },
      },
    },
  });

  if (!instance) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const user = {
    id: session.user.id as string,
    role: session.user.role as never,
  };

  // TIGHTENED 2026-09-10. This used to be `canAccessProperty` alone, which is
  // true for ANY user with a user_properties row at that property — so a
  // housekeeper at KE could export any KE checklist by guessing an id,
  // including the Manager Checklist that rates their own work. It was reachable
  // before; adding a visible Download PDF button to the fill page makes it
  // discoverable, which is not a change worth shipping over a hole.
  //
  // The rule, in the order the roles read:
  //   • manager-or-above (MANAGER / AGENT / CORPORATE / ADMIN) — as before,
  //     property-scoped, with canAccessProperty waving portfolio roles through;
  //   • everyone else — their own assigned instance and nothing else.
  const canExport = isManagerOrAbove(user.role)
    ? await canAccessProperty(user, instance.property.id)
    : instance.assignedUserId === user.id;
  if (!canExport) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ADR-036: the exported PDF must show the questions the checklist was
  // actually filled against, not a later edit of the template.
  const templateQuestions = await questionsForInstance(instance);

  // Map responses by questionId for fast lookup.
  const byQ = new Map(instance.responses.map((r) => [r.questionId, r]));

  const responses: PdfResponse[] = [];
  for (const q of templateQuestions) {
    // SECTION_DIVIDER questions have no answer — render as a prompt-only block.
    if (q.type === "SECTION_DIVIDER") {
      responses.push({ prompt: q.prompt, type: q.type, answerText: "", note: null, signatureUrl: null, photos: [] });
      continue;
    }

    const r = byQ.get(q.id);

    // Presign each photo URL just before render (1-hour TTL).
    const photos = await Promise.all(
      (r?.photos ?? []).map(async (p) => ({
        url: await presignDownload(p.r2Key),
        capturedAt: p.capturedAt ? formatInET(p.capturedAt) : null,
        geofence: GEO_LABEL[p.geofenceStatus],
        coords:
          p.gpsLat && p.gpsLng
            ? `${p.gpsLat.toString()}, ${p.gpsLng.toString()}`
            : null,
      })),
    );

    // Signature is stored as a data-URL string in response.answer (confirmed from
    // review page: `answer.startsWith("data:image")`). Render as image; no text.
    const isSignature = q.type === "SIGNATURE";
    const sigUrl =
      isSignature && typeof r?.answer === "string" && r.answer.startsWith("data:image")
        ? (r.answer as string)
        : null;

    responses.push({
      prompt: q.prompt,
      type: q.type,
      // Load-bearing on the export too: a PM PA checkpoint repeats the same
      // prompt three times and only the hint ("7:00pm" / "10:00pm" / "End of
      // shift") tells the three apart. Without it a printed round is unreadable.
      hint: q.hint,
      answerText: isSignature ? "" : answerToText(q.type, r?.answer ?? null),
      // Reviewers work from the PDF as often as the screen, so a note the
      // submitter left for them has to travel with the export.
      note: r?.notes ?? null,
      signatureUrl: sigUrl,
      photos,
    });
  }

  const title =
    instance.title ??
    `${instance.template.name} — ${instance.property.shortCode}`;

  const data = {
    title,
    propertyLabel: `${instance.property.shortCode} — ${instance.property.name}`,
    unit: roomDisplay(instance.room, instance.roomLabel),
    assignee: instance.assignedUser?.name ?? "Unassigned",
    startedAt: instance.openedAt ? formatInET(instance.openedAt) : null,
    completedAt: instance.submittedAt ? formatInET(instance.submittedAt) : null,
    // The same number the review screens show, formatted by the same function.
    // "—" when either end of the interval is missing — an unopened or
    // unsubmitted checklist took an unknown amount of time, never zero.
    timeToComplete: formatMinutes(
      timeToCompleteMinutes(instance.openedAt, instance.submittedAt),
    ),
    // Stamped once here and used by BOTH the repeating footer and the header's
    // "As of" line, so the two can never disagree across a multi-page export.
    generatedAt: formatInET(new Date()),
    systemId: instance.systemId,
    completionCheck: instance.completionCheck,
    reviewedBy: instance.reviewedBy?.name ?? null,
    // The reviewer's reason travels with the export: a flagged checklist
    // printed without the reason is the half that cannot be acted on.
    reviewerNote: instance.managerNote,
    responses,
  };

  const buffer = await renderPdfToBuffer(<ChecklistPdf data={data} />);

  // PDF filename per project convention: Title_PropertyID_MMDDYY.pdf
  // Use instance.property.propertyId (the external integer code, e.g. 6802).
  const safeName = title.replace(/[^a-z0-9]+/gi, "");
  const fname = `${safeName}_${instance.property.propertyId}.pdf`;

  // NextResponse body requires Uint8Array (raw Buffer fails the body type check).
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
