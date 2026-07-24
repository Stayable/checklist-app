import { GeofenceStatus } from "@prisma/client";

const GEOFENCE_BADGE: Record<GeofenceStatus, { label: string; cls: string }> = {
  [GeofenceStatus.VERIFIED]: { label: "On property", cls: "bg-emerald-50 text-emerald-700" },
  [GeofenceStatus.OFF_PROPERTY]: { label: "Off property", cls: "bg-red-50 text-red-700" },
  [GeofenceStatus.NO_GPS]: { label: "No GPS", cls: "bg-slate-100 text-slate-500" },
  // Informational, not an anomaly — no polygon configured yet (ADR-015).
  [GeofenceStatus.UNVERIFIED]: { label: "No geofence set", cls: "bg-amber-50 text-amber-700" },
};

export type PhotoFigureProps = {
  url: string;
  geofenceStatus: GeofenceStatus;
  capturedAt: string | null; // preformatted ET, e.g. "Jun 24, 2026 2:30 PM ET"
  gpsLat: string | null;
  gpsLng: string | null;
};

export function PhotoFigure({ url, geofenceStatus, capturedAt, gpsLat, gpsLng }: PhotoFigureProps) {
  const badge = GEOFENCE_BADGE[geofenceStatus];
  return (
    <figure className="flex w-32 flex-col gap-1">
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL */}
        <img
          src={url}
          alt={`Checklist photo — ${badge.label}${capturedAt ? `, ${capturedAt}` : ""}`}
          className="h-32 w-32 rounded-lg border border-slate-200 object-cover"
        />
      </a>
      <figcaption className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
        {badge.label}
      </figcaption>
      {capturedAt && <span className="text-[11px] leading-tight text-slate-500">{capturedAt}</span>}
      {gpsLat != null && gpsLng != null && (
        <span className="text-[11px] leading-tight text-slate-400">
          {gpsLat}, {gpsLng}
        </span>
      )}
    </figure>
  );
}
