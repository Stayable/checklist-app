"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseGeoJsonPolygon,
  parseLatLngPair,
  ringBounds,
  type LngLat,
} from "@/lib/geofence-input";
import { geofenceStatusFor } from "@/lib/geofence";
import {
  clearGeofence,
  saveGeofenceFromCircle,
  saveGeofenceFromGeoJson,
} from "../../actions";

// Two ways in, because the two have very different effort/precision trade-offs
// and the right one depends on the property:
//   • Paste GeoJSON traced on satellite imagery — precise, needs geojson.io.
//   • Centre + radius — a lat/lng from Google Maps and a number.
// Both end up as the same GeoJSON Polygon; the server re-validates either way.
//
// The preview is a plain SVG of the ring, NOT a map. It deliberately does not
// pretend to satellite context — it confirms shape, closure and orientation,
// which is what catches a mis-paste. The point tester is what confirms the
// boundary is in the right PLACE: paste a coordinate you know is on property and
// see whether the same evaluator that runs at photo submit calls it verified.

type Saved = { polygon: unknown; ring: LngLat[] } | null;

export function GeofenceEditor({
  propertyId,
  shortCode,
  address,
  saved,
}: {
  propertyId: string;
  shortCode: string;
  address: string;
  saved: Saved;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [geojson, setGeojson] = useState("");
  const [centre, setCentre] = useState("");
  const [radius, setRadius] = useState("150");
  const [testPoint, setTestPoint] = useState("");

  // Live client-side parse purely for feedback. The server parses again and is
  // the authority — this only shortens the loop.
  const draft = useMemo(() => (geojson.trim() ? parseGeoJsonPolygon(geojson) : null), [geojson]);
  const previewRing: LngLat[] | null = draft?.ok
    ? draft.polygon.coordinates[0]
    : (saved?.ring ?? null);
  const previewIsDraft = Boolean(draft?.ok);

  const testResult = useMemo(() => {
    const point = parseLatLngPair(testPoint);
    if (!point) return null;
    const polygon = draft?.ok ? draft.polygon : saved?.polygon;
    if (!polygon) return { point, status: "UNVERIFIED" as const };
    return { point, status: geofenceStatusFor(point, polygon) };
  }, [testPoint, draft, saved]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setBanner(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setBanner({ kind: "err", text: result.error ?? "Something went wrong." });
        return;
      }
      setBanner({ kind: "ok", text: okText });
      setGeojson("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {banner && (
        <div
          className={`rounded-md p-2 text-sm ${
            banner.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Current</h2>
        <p className="mt-1 text-sm text-slate-700">
          {saved ? (
            <>
              Boundary set — {saved.ring.length - 1} corners. Photos here are checked against it
              with a 50 m buffer.
            </>
          ) : (
            <>
              No boundary set. Every photo taken at {shortCode} is stored{" "}
              <span className="font-semibold">UNVERIFIED</span> until one exists.
            </>
          )}
        </p>
        {saved && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Remove the boundary for ${shortCode}? New photos will store UNVERIFIED.`))
                return;
              run(() => clearGeofence(propertyId), "Boundary removed.");
            }}
            className="mt-2 rounded-md px-3 py-1.5 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            Remove boundary
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Option 1 — trace it (precise)
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-600">
            <li>
              Open{" "}
              <a
                href="https://geojson.io"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-navy hover:underline"
              >
                geojson.io
              </a>{" "}
              and search for <span className="font-mono">{address}</span>
            </li>
            <li>Switch to satellite, draw a polygon around the property</li>
            <li>Copy the JSON from the right-hand panel and paste it below</li>
          </ol>
          <textarea
            value={geojson}
            onChange={(e) => setGeojson(e.target.value)}
            rows={6}
            placeholder='{"type":"FeatureCollection","features":[…]}'
            className="mt-2 w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
          />
          {draft && !draft.ok && (
            <p className="mt-1 text-xs text-red-700">{draft.error}</p>
          )}
          {draft?.ok && (
            <p className="mt-1 text-xs text-emerald-700">
              Looks good — {draft.pointCount} corners.
            </p>
          )}
          <button
            type="button"
            disabled={pending || !draft?.ok}
            onClick={() =>
              run(() => saveGeofenceFromGeoJson(propertyId, geojson), "Boundary saved.")
            }
            className="mt-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Save traced boundary
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Option 2 — centre and radius (quick)
          </h2>
          <p className="mt-2 text-xs text-slate-600">
            In Google Maps, right-click the middle of the property and click the coordinates to copy
            them, then paste here. Good enough for a badge that already allows 50 m of drift.
          </p>
          <label className="mt-2 block text-sm text-slate-700">
            Centre (latitude, longitude)
            <input
              value={centre}
              onChange={(e) => setCentre(e.target.value)}
              placeholder="28.1392, -81.9695"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 font-mono text-sm"
            />
          </label>
          <label className="mt-2 block text-sm text-slate-700">
            Radius (meters)
            <input
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending || !parseLatLngPair(centre)}
            onClick={() => {
              const point = parseLatLngPair(centre);
              if (!point) return;
              run(
                () => saveGeofenceFromCircle(propertyId, point.lat, point.lng, Number(radius)),
                "Boundary saved from centre and radius.",
              );
            }}
            className="mt-3 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Save circle
          </button>
          {centre.trim() && !parseLatLngPair(centre) && (
            <p className="mt-1 text-xs text-red-700">
              Expected two numbers, e.g. 28.1392, -81.9695
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Shape {previewIsDraft ? "(pasted, not yet saved)" : saved ? "(saved)" : ""}
          </h2>
          {previewRing ? (
            <>
              <RingPreview ring={previewRing} testPoint={testResult?.point ?? null} />
              <p className="mt-1 text-xs text-slate-400">
                Outline only — not a map. Use the point test to confirm the location.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nothing to preview yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Test a coordinate
          </h2>
          <p className="mt-2 text-xs text-slate-600">
            Paste a point you know is on the property. This runs the same check that runs when a
            photo is submitted.
          </p>
          <input
            value={testPoint}
            onChange={(e) => setTestPoint(e.target.value)}
            placeholder="28.1392, -81.9695"
            className="mt-2 w-full rounded-md border border-slate-300 p-2 font-mono text-sm"
          />
          {testPoint.trim() && !testResult && (
            <p className="mt-1 text-xs text-red-700">Expected two numbers, e.g. 28.1392, -81.9695</p>
          )}
          {testResult && (
            <p className="mt-2 text-sm">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  testResult.status === "VERIFIED"
                    ? "bg-emerald-50 text-emerald-700"
                    : testResult.status === "OFF_PROPERTY"
                      ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {testResult.status}
              </span>
              {testResult.status === "UNVERIFIED" && (
                <span className="ml-2 text-xs text-slate-500">
                  No boundary to check against yet.
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        The badge is informational: an off-property photo still submits. Nothing is blocked by this.{" "}
        <Link href="/admin/properties" className="font-medium text-navy hover:underline">
          Back to properties
        </Link>
      </p>
    </div>
  );
}

/** The ring as an SVG, normalised to its own bounding box. Longitude degrees are
 *  narrower than latitude degrees at this latitude, so the box is scaled by
 *  cos(lat) — without it a square parcel renders visibly stretched. */
function RingPreview({ ring, testPoint }: { ring: LngLat[]; testPoint: { lat: number; lng: number } | null }) {
  const size = 220;
  const pad = 12;
  const bounds = ringBounds(ring);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180);

  const width = Math.max((bounds.maxLng - bounds.minLng) * lngScale, 1e-9);
  const height = Math.max(bounds.maxLat - bounds.minLat, 1e-9);
  const scale = (size - pad * 2) / Math.max(width, height);

  const project = (lng: number, lat: number): [number, number] => [
    pad + (lng - bounds.minLng) * lngScale * scale,
    // SVG y grows downward; latitude grows upward.
    size - pad - (lat - bounds.minLat) * scale,
  ];

  const points = ring.map(([lng, lat]) => project(lng, lat).join(",")).join(" ");
  const marker = testPoint ? project(testPoint.lng, testPoint.lat) : null;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mt-2 h-56 w-full"
      role="img"
      aria-label="Property boundary outline"
    >
      <rect x="0" y="0" width={size} height={size} rx="8" className="fill-slate-50" />
      <polygon points={points} className="fill-sky-100 stroke-navy" strokeWidth="2" />
      {ring.slice(0, -1).map(([lng, lat], i) => {
        const [x, y] = project(lng, lat);
        return <circle key={i} cx={x} cy={y} r="2.5" className="fill-navy" />;
      })}
      {marker && (
        <circle cx={marker[0]} cy={marker[1]} r="4" className="fill-red-500 stroke-white" strokeWidth="1.5" />
      )}
    </svg>
  );
}
