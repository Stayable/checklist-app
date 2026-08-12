import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  SUPPORTED_CONTRACT_VERSION,
  contractorUpdatePayloadSchema,
  readContractVersion,
} from "@/lib/contractor-update";
import { ingestContractorUpdate } from "@/lib/contractor-update.server";
import { db } from "@/lib/db";
import { verifyHmacSignature } from "@/lib/network/hmac";

// Contractor update fan-out receiver
// (docs/ContractorUpdateFanout_Contract_081226.md §3–§5, §12).
//
// The WhatsApp voice pipeline POSTs here after it writes Smartsheet. One way:
// nothing in this repo calls back, and this route creates no send path
// (ADR-028/030). No session auth — HMAC-SHA256 over the raw body only. This
// route sits outside the locale middleware.
//
// ⚠ EVERY NON-CRASH OUTCOME RETURNS 200. That is deliberate and load-bearing:
// the pipeline places this call BEFORE its non-idempotent Smartsheet comment
// so that a raised failure can re-run the whole queue message, and Twilio
// retries anything that is not 2xx. A 4xx for "we could not map this" would
// therefore be retried forever for a payload that will never map. The only
// non-200s are 401 (bad signature — genuinely worth retrying after the secret
// is fixed) and 400 for a body that is not JSON at all.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Fail-closed in production when the shared secret is unset, mirroring
// app/api/webhooks/unifi/route.ts and the cron routes. Outside production an
// unset secret skips the check so a replayed fixture can be tested locally
// without holding the real key.
function resolveSignatureValid(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.CONTRACTOR_UPDATE_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return verifyHmacSignature(rawBody, signatureHeader, secret);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const valid = resolveSignatureValid(rawBody, req.headers.get("x-webhook-signature"));

  // CAPTURE BEFORE TRUST, unconditionally and before parsing. A lost webhook
  // here is a contractor's report of a day's work, so an unmappable or
  // unsigned delivery must still leave a recoverable record.
  //
  // Note this is contractor_update_captures, NOT raw_webhook_payloads: that
  // table's `source` column is the DEVICE enum DeviceSource, and a contractor
  // update is not a device source. Same discipline, different table.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await db.contractorUpdateCapture.create({
      data: { signatureValid: valid, payload: rawBody },
    });
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  await db.contractorUpdateCapture.create({
    data: { signatureValid: valid, payload: payload as Prisma.InputJsonValue },
  });

  if (!valid) {
    return NextResponse.json({ ok: false, reason: "invalid_signature" }, { status: 401 });
  }

  // §12: the version gate runs BEFORE full validation, because a future major
  // version may legitimately carry a shape this schema rejects and that must
  // read as version skew, not as malformed data.
  const version = readContractVersion(payload);
  if (version !== SUPPORTED_CONTRACT_VERSION) {
    return NextResponse.json({ ok: false, reason: "unsupported_version", version });
  }

  const parsed = contractorUpdatePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      reason: "invalid_payload",
      detail: parsed.error.issues[0]?.message ?? "invalid",
    });
  }

  const result = await ingestContractorUpdate(parsed.data);

  if (result.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    resolution: result.resolution,
    jobId: result.jobId,
    matchedBy: result.matchedBy,
  });
}
