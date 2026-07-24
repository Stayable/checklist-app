import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyHmacSignature } from "@/lib/network/hmac";
import { ingestWebhook } from "@/lib/network/ingest.server";
import { parseUnifiPayload } from "@/lib/network/parse";

// UniFi Protect/Network webhook receiver (NETWORK epic, Task 3). No session
// auth — HMAC-SHA256 only (see lib/network/hmac.ts for the assumed scheme,
// unconfirmed pending a live controller capture, spec §3.3). This route sits
// outside the locale middleware.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Fail-closed in production when the shared secret isn't configured (mirrors
// app/api/cron/generate-checklists/route.ts `authorized()`): an unset secret
// on a live site must never be treated as "anything goes." Outside
// production an unset secret is a deliberate dev/fixture convenience — the
// signature check is skipped so local webhook fixtures can be replayed
// without a real controller.
function resolveSignatureValid(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.UNIFI_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return verifyHmacSignature(rawBody, signatureHeader, secret);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const valid = resolveSignatureValid(rawBody, req.headers.get("x-webhook-signature"));

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Capture-before-trust (spec §3.3): store what we got even though it
    // isn't valid JSON, so it's available for later reconciliation.
    await db.rawWebhookPayload.create({
      data: { source: "UNIFI_PROTECT", signatureValid: valid, payload: rawBody },
    });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Always persist the raw payload before acting on it, regardless of
  // signature validity — this is our only record of an unverified/unmapped
  // delivery. UNIFI_PROTECT is used as the umbrella capture source; the
  // per-event source (UNIFI_PROTECT vs UNIFI_NETWORK) is resolved precisely
  // by parseUnifiPayload below.
  await db.rawWebhookPayload.create({
    data: {
      source: "UNIFI_PROTECT",
      signatureValid: valid,
      payload: payload as Prisma.InputJsonValue,
    },
  });

  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const parsed = parseUnifiPayload(payload);
  if (!parsed) {
    return NextResponse.json({ ok: true, mapped: false });
  }

  const result = await ingestWebhook(parsed.source, rawBody, parsed);
  if (!result.resolved) {
    return NextResponse.json({ ok: true, resolved: false });
  }

  return NextResponse.json({ ok: true, eventId: result.eventId, eventType: result.eventType });
}
