import { NextResponse } from "next/server";
import { GeofenceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canAccessProperty } from "@/lib/rbac";
import { presignDownload } from "@/lib/r2";
import { formatInET } from "@/lib/datetime";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { ChecklistPdf, type PdfResponse } from "@/lib/pdf/ChecklistPdf";
import { answerToText } from "@/lib/pdf/answer-text";

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
      template: {
        select: {
          name: true,
          questions: { orderBy: { orderIndex: "asc" } },
        },
      },
      property: {
        select: { id: true, shortCode: true, name: true, propertyId: true },
      },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { name: true } },
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

  if (!(await canAccessProperty(user, instance.property.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Map responses by questionId for fast lookup.
  const byQ = new Map(instance.responses.map((r) => [r.questionId, r]));

  const responses: PdfResponse[] = [];
  for (const q of instance.template.questions) {
    // SECTION_DIVIDER questions have no answer — render as a prompt-only block.
    if (q.type === "SECTION_DIVIDER") {
      responses.push({ prompt: q.prompt, type: q.type, answerText: "", signatureUrl: null, photos: [] });
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
      isSignature && typeof r?.answer === "string" ? (r.answer as string) : null;

    responses.push({
      prompt: q.prompt,
      type: q.type,
      answerText: isSignature ? "" : answerToText(q.type, r?.answer ?? null),
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
    unit: instance.room?.roomNumber ?? null,
    assignee: instance.assignedUser?.name ?? "Unassigned",
    startedAt: instance.openedAt ? formatInET(instance.openedAt) : null,
    completedAt: instance.submittedAt ? formatInET(instance.submittedAt) : null,
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
