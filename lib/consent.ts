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
