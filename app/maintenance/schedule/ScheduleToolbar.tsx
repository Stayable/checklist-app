import Link from "next/link";
import {
  CALENDAR_VIEWS,
  VIEW_LABELS,
  shiftAnchor,
  toCompact,
  type CalendarView,
} from "@/lib/contractor-schedule";

// View state lives entirely in the URL (?view=&date=), so every control here
// is a plain Link and there is no client date state at all — a view is
// shareable and a reload is stable. Takes view/date/title as props rather than
// reading searchParams itself, which would need a Suspense boundary.

function href(view: CalendarView, ymd: string): string {
  return `/maintenance/schedule?view=${view}&date=${toCompact(ymd)}`;
}

export function ScheduleToolbar({
  view,
  anchorYMD,
  todayYmd,
  title,
}: {
  view: CalendarView;
  anchorYMD: string;
  todayYmd: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Link
          href={href(view, shiftAnchor(view, anchorYMD, -1))}
          aria-label="Previous period"
          className="rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          ←
        </Link>
        <Link
          href={href(view, todayYmd)}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Today
        </Link>
        <Link
          href={href(view, shiftAnchor(view, anchorYMD, 1))}
          aria-label="Next period"
          className="rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          →
        </Link>
        <span className="ml-2 text-sm font-semibold text-slate-900">{title}</span>
      </div>

      <div className="flex items-center gap-1">
        {CALENDAR_VIEWS.map((v) => (
          <Link
            key={v}
            href={href(v, anchorYMD)}
            aria-current={v === view ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${
              v === view
                ? "bg-navy text-white"
                : "text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
        <Link
          href="/maintenance/jobs/new"
          className="ml-2 rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          New job
        </Link>
      </div>
    </div>
  );
}
