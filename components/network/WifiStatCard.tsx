// Shared stat-card for the Guest WiFi (Spotipo) pages (spec §11.5). Small and
// local to this feature — not the same shape as app/network/page.tsx's
// SummaryCard (which takes a color tone prop this section doesn't need).
export function WifiStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
      <span className="text-3xl font-bold text-slate-900">{value}</span>
      <span className="text-sm font-medium text-slate-600">{label}</span>
    </div>
  );
}
