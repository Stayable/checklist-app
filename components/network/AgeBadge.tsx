import type { AgeBucket } from "@/lib/network/ticket-age";

// Shared ticket-age color dot + label (spec §6.1). Was copy-pasted (the
// AGE_DOT map + a span/span markup) in app/network/page.tsx,
// app/network/tickets/page.tsx, and app/network/tickets/[id]/page.tsx —
// carried Task-6 Minor #3, deduped here.
const AGE_DOT: Record<AgeBucket, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export function AgeBadge({ bucket }: { bucket: AgeBucket }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${AGE_DOT[bucket]}`} />
      {bucket}
    </span>
  );
}
