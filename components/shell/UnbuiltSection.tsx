// components/shell/UnbuiltSection.tsx
import { PageHeader } from "./PageHeader";

// Shared stub for nav sections that exist but have nothing behind them yet
// (Maintenance, Construction — ADR-028). The point is to be unambiguous: this
// is not an empty list, a permission problem, or a page that failed to load.
export function UnbuiltSection({
  title,
  track,
  summary,
  planned,
}: {
  title: string;
  track: string;
  summary: string;
  planned: string[];
}) {
  return (
    <>
      <PageHeader title={title} />

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <span className="inline-block rounded bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
          Not built yet
        </span>

        <p className="mt-4 max-w-2xl text-sm text-slate-600">{summary}</p>

        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
          Planned scope ({track})
        </p>
        <ul className="mt-2 max-w-2xl list-disc space-y-1 pl-5 text-sm text-slate-600">
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="mt-6 max-w-2xl text-xs text-slate-500">
          Nothing here reads or writes data. The section is in the navigation so the
          shape of the platform is visible, not because work has started.
        </p>
      </div>
    </>
  );
}
