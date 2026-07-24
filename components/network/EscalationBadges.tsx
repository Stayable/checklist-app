// Shared display-only "Escalated" / "[OVERNIGHT]" badges (Task 10, spec §9).
// Mirrors components/network/AgeBadge.tsx's dedup pattern — used identically
// on the portfolio dashboard, ticket list, and ticket detail so the three
// surfaces render the same minimal/muted markup. Neither flag drives any
// notification; see lib/network/escalation.ts + docs/DECISIONS.md ADR-026.

export function EscalationBadges({
  escalated,
  overnight,
}: {
  escalated: boolean;
  overnight: boolean;
}) {
  if (!escalated && !overnight) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {escalated && (
        <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
          Escalated
        </span>
      )}
      {overnight && (
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          [OVERNIGHT]
        </span>
      )}
    </span>
  );
}
