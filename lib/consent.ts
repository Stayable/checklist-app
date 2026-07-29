import { ConsentChannel } from "@prisma/client";

// ConsentRecord is append-only: a revocation is a NEW row, never an update. So
// "do we have consent right now?" is not a single-row lookup — it is "does at
// least one unrevoked grant exist for this channel?", which also makes
// re-consent after a STOP work without mutating history.

export type ConsentLike = { channel: ConsentChannel; revokedAt: Date | null };

/**
 * True iff at least one unrevoked grant exists for `channel`.
 *
 * Spec A's dispatch.server.ts MUST call this before sending, and refuse with a
 * visible dispatcher-facing reason when it returns false. That is a compliance
 * hard stop, not a warning.
 */
export function hasLiveConsent(records: ConsentLike[], channel: ConsentChannel): boolean {
  return records.some((r) => r.channel === channel && r.revokedAt === null);
}

// Dispatcher-facing consent visibility (T9 — /contractors). Not the compliance
// hard stop (that's Spec A's dispatch.server.ts calling hasLiveConsent
// directly); this is "what should a dispatcher see before reaching for
// WhatsApp." Consented always wins; short of that, an invite already in
// flight beats prompting to send another one; short of that, whether "Send
// consent invite" is even actionable depends on having somewhere to email it.
export type ConsentDisplayState =
  | { kind: "consented" }
  | { kind: "invite_outstanding"; expiresAt: Date }
  | { kind: "not_consented"; canInvite: boolean };

export function consentDisplayState(input: {
  consentRecords: ConsentLike[];
  outstandingInvite: { expiresAt: Date } | null;
  hasEmail: boolean;
}): ConsentDisplayState {
  if (hasLiveConsent(input.consentRecords, ConsentChannel.WHATSAPP)) {
    return { kind: "consented" };
  }
  if (input.outstandingInvite) {
    return { kind: "invite_outstanding", expiresAt: input.outstandingInvite.expiresAt };
  }
  return { kind: "not_consented", canInvite: input.hasEmail };
}
