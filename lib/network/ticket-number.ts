import { etYYYYMMDD } from "../datetime";

/**
 * Formats a NetworkJob/Ticket number as `TKT-YYYYMMDD-NNN`, mirroring the
 * ADR-009 checklist system-ID convention (`CL-...-{seq}`). The date portion
 * is the Eastern-Time calendar date (auto EDT/EST) of `date` — always via
 * `etYYYYMMDD` from lib/datetime.ts, never reimplemented here.
 *
 * `seq` is zero-padded to a MINIMUM of 3 digits (not truncated) — e.g. 1 ->
 * "001", 42 -> "042", 100 -> "100", 1000 -> "1000". Seq allocation against
 * the DB (restart at 001 each ET day) is NOT handled here — this is only
 * the formatter.
 */
export function formatTicketNumber(date: Date, seq: number): string {
  const ymd = etYYYYMMDD(date);
  const paddedSeq = String(seq).padStart(3, "0");
  return `TKT-${ymd}-${paddedSeq}`;
}
