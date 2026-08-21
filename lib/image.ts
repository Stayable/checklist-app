// Client-side image helpers. Browser-only (uses canvas/Image) — import from
// client components. Mirrors the compression settings proven in the /ios-spike
// de-risk page so checklist photo capture and the spike stay consistent.
//
// Per CLAUDE.md photo spec: compress to max 1920px long edge, JPEG quality 85,
// ~500KB target. GPS is captured separately via navigator.geolocation (iOS
// strips EXIF GPS), not read from the file here.

export const MAX_LONG_EDGE = 1920;
export const JPEG_QUALITY = 0.85;

export type CompressedImage = {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
      type,
      quality,
    );
  });
}

/** Downscale to MAX_LONG_EDGE and re-encode as JPEG at JPEG_QUALITY. */
export async function compressImage(file: File): Promise<CompressedImage> {
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(srcUrl);
    const longEdge = Math.max(img.width, img.height);
    const scale = Math.min(1, MAX_LONG_EDGE / longEdge);
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    return {
      blob,
      width,
      height,
      originalBytes: file.size,
      compressedBytes: blob.size,
    };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

export type Position = { latitude: number; longitude: number; accuracy: number };

/** Promise wrapper around navigator.geolocation.getCurrentPosition (high accuracy). */
export function getCurrentPosition(timeoutMs = 30000): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("navigator.geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
      (err) => reject(new Error(`${err.code}: ${err.message}`)),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/**
 * Why a photo has no coordinates. `NO_GPS` on its own is unactionable — the
 * user cannot tell "blocked in Settings" from "still searching", and neither
 * could we: the first version of this discarded the reason entirely, so four
 * of the first five photos in production were unexplainable after the fact.
 *
 * `denied` is terminal for the origin until the user changes a browser setting,
 * so it must never be retried; the others are worth another attempt.
 */
export type GeoFailure = "unsupported" | "denied" | "unavailable" | "timeout";

export type GeoResult =
  | { ok: true; position: Position }
  | { ok: false; reason: GeoFailure };

/**
 * Accept a fix up to a minute old. The previous request passed
 * `maximumAge: 0`, refusing a perfectly good fix the OS already had — the
 * most expensive possible ask, on the tightest possible deadline.
 */
export const GPS_MAX_AGE_MS = 60_000;

/**
 * A cold GPS needs longer than a warm one. Measured in production 2026-08-20:
 * a first capture failed at the old 10s deadline, and a second capture 11s
 * later returned a 39.5m fix — the first call had warmed the receiver for the
 * second. 25s covers a cold start; the caller never blocks on it.
 */
export const GPS_TIMEOUT_MS = 25_000;

/** GeolocationPositionError codes, which are numbers in the DOM spec. */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

/**
 * Acquire a position for geofence evaluation, reporting WHY it failed.
 *
 * Deliberately still `enableHighAccuracy: true`. A coarse Wi-Fi fix can be
 * kilometres wide, and the server evaluates the geofence from coordinates
 * alone with no regard for accuracy — so accepting coarse fixes would trade
 * "no verdict" for "a confident wrong verdict" on fences that span 109–243m.
 * Losing a fix is recoverable; a photo stamped VERIFIED from three blocks away
 * is not.
 */
export function acquirePosition(
  timeoutMs: number = GPS_TIMEOUT_MS,
  maxAgeMs: number = GPS_MAX_AGE_MS,
): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve({ ok: false, reason: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          ok: true,
          position: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          },
        }),
      (err) =>
        resolve({
          ok: false,
          reason:
            err.code === PERMISSION_DENIED
              ? "denied"
              : err.code === POSITION_UNAVAILABLE
                ? "unavailable"
                : "timeout",
        }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maxAgeMs },
    );
  });
}
