import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { presignUpload, presignDownload, photoTestKey } from "@/lib/r2";

// POST /api/photos/presign — mint a presigned PUT (and matching GET) for a
// client-side direct upload to R2 (ARCH §2.2.1 step 5). Auth required; the
// client never sees R2 credentials, only short-lived signed URLs.
//
// Scopes:
//   - "test": /photo-test page round-trip (throwaway prefix)
//   - "response" scope lands with the checklist-filler upload wiring (needs
//     instance/question ownership checks, so it is added alongside that work)

const bodySchema = z.object({
  scope: z.literal("test"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Compression always re-encodes to JPEG client-side (lib/image.ts), so the
  // content type is fixed rather than caller-supplied.
  const key = photoTestKey(session.user.id);
  const [uploadUrl, downloadUrl] = await Promise.all([
    presignUpload(key, "image/jpeg"),
    presignDownload(key),
  ]);

  return NextResponse.json({ key, uploadUrl, downloadUrl });
}
