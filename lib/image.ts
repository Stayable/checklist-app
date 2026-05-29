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
