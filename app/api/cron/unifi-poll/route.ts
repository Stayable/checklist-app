import { NextResponse } from "next/server";
import { runUnifiPoll } from "@/lib/network/unifi-poll.server";

// UniFi Site Manager poll sweep (T11, 2026-07-27). Vercel Cron fires this
// every 2 minutes (vercel.json) — the pull-based counterpart to
// /api/webhooks/unifi. Detection latency is the poll interval on top of the
// 5-minute standard-ticket timer, so worst case is ~7 minutes to a ticket;
// accepted (Kyle 2026-07-27) in exchange for not depending on an unconfirmed
// vendor webhook contract.
//
// Auth mirrors the other cron routes: fail-closed in production when
// CRON_SECRET is unset, dev-open otherwise.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev-only convenience
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 200 even when the upstream fetch failed, no key is configured, or the
  // sweep threw: this is a scheduled job, and a non-2xx would make Vercel's
  // cron history read as a platform fault when it is really "UniFi had a bad
  // minute" or "not wired up yet." The body carries the truth, and a repeated
  // `ok: false` is the signal to look. Nothing user-facing depends on this
  // route's status code.
  try {
    return NextResponse.json(await runUnifiPoll());
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "unifi_poll_failed",
    });
  }
}
