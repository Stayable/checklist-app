import { NextResponse } from "next/server";
import { z } from "zod";
import { InstanceStatus, IssueStatus, QuestionType, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isManagerOrAbove } from "@/lib/rbac";
import {
  presignUpload,
  presignDownload,
  photoTestKey,
  responsePhotoKey,
  issuePhotoKey,
} from "@/lib/r2";

// POST /api/photos/presign — mint presigned PUTs (and matching GETs) for
// client-side direct uploads to R2 (ARCH §2.2.1 step 5, ADR-015). Auth
// required; the client never sees R2 credentials, only short-lived signed URLs.
//
// Scopes:
//   - "test": /photo-test page round-trip (throwaway prefix, single URL)
//   - "response": checklist filler upload at submit — caller must be the
//     instance assignee or a manager of its property, the instance must still
//     be fillable, and the question must be a PHOTO question on its template.
//   - "issue": resolution-evidence upload at close — caller must be a manager+
//     of the issue's property and the issue must still be open.

const MAX_BATCH = 10; // hard ceiling; per-question photoMax also applies
const ISSUE_PHOTO_MAX = 5; // resolution evidence cap

const bodySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("test") }),
  z.object({
    scope: z.literal("response"),
    instanceId: z.string().uuid(),
    questionId: z.string().uuid(),
    count: z.number().int().min(1).max(MAX_BATCH),
  }),
  z.object({
    scope: z.literal("issue"),
    issueId: z.string().uuid(),
    count: z.number().int().min(1).max(ISSUE_PHOTO_MAX),
  }),
]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const body = parsed.data;

  // Compression always re-encodes to JPEG client-side (lib/image.ts), so the
  // content type is fixed rather than caller-supplied.
  if (body.scope === "test") {
    const key = photoTestKey(session.user.id);
    const [uploadUrl, downloadUrl] = await Promise.all([
      presignUpload(key, "image/jpeg"),
      presignDownload(key),
    ]);
    return NextResponse.json({ key, uploadUrl, downloadUrl });
  }

  if (body.scope === "issue") {
    const issue = await db.issue.findUnique({
      where: { id: body.issueId },
      select: { status: true, propertyId: true },
    });
    if (!issue) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Closing an issue is a manager+ action (mirrors closeIssue / requireManager).
    const canManage =
      isManagerOrAbove(session.user.role) &&
      (session.user.role === Role.CORPORATE ||
        session.user.role === Role.ADMIN ||
        (await db.userProperty.findUnique({
          where: {
            userId_propertyId: { userId: session.user.id, propertyId: issue.propertyId },
          },
          select: { userId: true },
        })) !== null);
    if (!canManage) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    if (issue.status === IssueStatus.RESOLVED || issue.status === IssueStatus.WONT_FIX) {
      return NextResponse.json({ error: "already closed" }, { status: 409 });
    }

    const uploads = await Promise.all(
      Array.from({ length: body.count }, async () => {
        const key = issuePhotoKey(body.issueId);
        return { key, uploadUrl: await presignUpload(key, "image/jpeg") };
      }),
    );
    return NextResponse.json({ uploads });
  }

  // scope === "response"
  const instance = await db.checklistInstance.findUnique({
    where: { id: body.instanceId },
    select: {
      status: true,
      assignedUserId: true,
      propertyId: true,
      template: {
        select: {
          questions: {
            where: { id: body.questionId },
            select: { type: true, photoMax: true },
          },
        },
      },
    },
  });
  if (!instance) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Same authorization rule as submitChecklist: assignee, or manager+ with
  // property membership (CORPORATE/ADMIN pass outright).
  const isAssignee = instance.assignedUserId === session.user.id;
  const canManage =
    isManagerOrAbove(session.user.role) &&
    (session.user.role === "CORPORATE" ||
      session.user.role === "ADMIN" ||
      (await db.userProperty.findUnique({
        where: {
          userId_propertyId: { userId: session.user.id, propertyId: instance.propertyId },
        },
        select: { userId: true },
      })) !== null);
  if (!isAssignee && !canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (
    instance.status === InstanceStatus.SUBMITTED ||
    instance.status === InstanceStatus.REVIEWED
  ) {
    return NextResponse.json({ error: "already submitted" }, { status: 409 });
  }

  const question = instance.template.questions[0];
  if (!question || question.type !== QuestionType.PHOTO) {
    return NextResponse.json({ error: "not a photo question" }, { status: 400 });
  }
  if (question.photoMax != null && body.count > question.photoMax) {
    return NextResponse.json({ error: "over photo limit" }, { status: 400 });
  }

  const uploads = await Promise.all(
    Array.from({ length: body.count }, async () => {
      const key = responsePhotoKey(body.instanceId, body.questionId);
      return { key, uploadUrl: await presignUpload(key, "image/jpeg") };
    }),
  );
  return NextResponse.json({ uploads });
}
