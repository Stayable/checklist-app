"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Self-contained on purpose: this throwaway spike must build and deploy on its
// own, independent of the rest of Week-1 foundation. Device-local timestamp
// (not the ET helper) — for an on-device test the phone's own clock is what
// you want to correlate against, and it avoids a cross-module dependency.
function stamp(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// iOS PWA viability spike (TODO.md Phase 1 — Fri photo POC / GO-NO-GO).
// Purpose: answer, on a REAL iPhone launched from the home-screen icon, whether
//   1. navigator.geolocation returns coords in standalone display mode
//   2. native camera capture returns a fresh photo
//   3. client-side canvas compression works (iOS canvas.toBlob historically buggy)
// No backend, no R2, no auth. Everything is reported on-screen so it can be
// screenshotted into docs/PWA_TEST_RESULTS.md. Throwaway — delete after GO/NO-GO.
// ---------------------------------------------------------------------------

type LogLine = { t: string; msg: string };

const MAX_LONG_EDGE = 1920;
const JPEG_QUALITY = 0.85;

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      type,
      quality,
    );
  });
}

export default function IosSpikePage() {
  const [standalone, setStandalone] = useState<string>("checking…");
  const [permState, setPermState] = useState<string>("unknown");
  const [ua, setUa] = useState<string>("");
  const [gps, setGps] = useState<string>("—");
  const [photo, setPhoto] = useState<{ url: string; size: number; name: string } | null>(null);
  const [compressed, setCompressed] = useState<{ url: string; size: number; w: number; h: number } | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const originalFile = useRef<File | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const append = useCallback((msg: string) => {
    setLog((prev) => [{ t: stamp(), msg }, ...prev]);
  }, []);

  // Detect display mode — the whole point is confirming we're in STANDALONE,
  // not a Safari tab, before trusting any result below.
  useEffect(() => {
    const navAny = window.navigator as Navigator & { standalone?: boolean };
    const mq = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = navAny.standalone === true;
    setStandalone(mq || iosStandalone ? "YES — standalone" : "NO — browser tab");
    setUa(window.navigator.userAgent);

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((r) => {
          setPermState(r.state);
          r.onchange = () => setPermState(r.state);
        })
        .catch(() => setPermState("permissions API unavailable"));
    } else {
      setPermState("permissions API unavailable");
    }
  }, []);

  const getGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps("navigator.geolocation MISSING");
      append("GPS: navigator.geolocation not present");
      return;
    }
    setGps("requesting…");
    append("GPS: requesting position (high accuracy, 30s timeout)…");
    const started = performance.now();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ms = Math.round(performance.now() - started);
        const { latitude, longitude, accuracy } = pos.coords;
        const line = `lat ${latitude.toFixed(6)}, lng ${longitude.toFixed(6)}, ±${Math.round(accuracy)}m in ${ms}ms`;
        setGps(`✅ ${line}`);
        append(`GPS OK: ${line}`);
      },
      (err) => {
        const codes: Record<number, string> = {
          1: "PERMISSION_DENIED",
          2: "POSITION_UNAVAILABLE",
          3: "TIMEOUT",
        };
        const line = `${codes[err.code] ?? "ERR"} — ${err.message}`;
        setGps(`❌ ${line}`);
        append(`GPS FAIL: ${line}`);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    );
  }, [append]);

  const onPhoto = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      originalFile.current = file;
      const url = URL.createObjectURL(file);
      setPhoto({ url, size: file.size, name: file.name });
      setCompressed(null);
      append(`Photo captured: ${file.name || "(no name)"} ${kb(file.size)} ${file.type}`);
    },
    [append],
  );

  const compress = useCallback(async () => {
    const file = originalFile.current;
    if (!file) {
      append("Compress: no photo captured yet");
      return;
    }
    append("Compress: starting…");
    try {
      const srcUrl = URL.createObjectURL(file);
      const img = await loadImage(srcUrl);
      const longEdge = Math.max(img.width, img.height);
      const scale = Math.min(1, MAX_LONG_EDGE / longEdge);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
      URL.revokeObjectURL(srcUrl);
      setCompressed({ url: URL.createObjectURL(blob), size: blob.size, w, h });
      append(
        `Compress OK: ${img.width}×${img.height} → ${w}×${h}, ${kb(file.size)} → ${kb(blob.size)}`,
      );
    } catch (err) {
      append(`Compress FAIL: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [append]);

  const row = "flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-3";
  const btn =
    "w-full rounded-lg bg-sky-600 px-4 py-4 text-base font-semibold text-white active:bg-sky-700 disabled:opacity-40";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-slate-900 p-4 text-slate-100">
      <header className="pt-2">
        <h1 className="text-lg font-bold">iOS PWA Spike</h1>
        <p className="text-xs text-slate-400">
          Launch from the home-screen icon, confirm <b>Standalone: YES</b>, then run all three.
        </p>
      </header>

      <section className={row}>
        <div className="flex justify-between">
          <span className="text-slate-400">Display mode</span>
          <span className="font-mono font-semibold">{standalone}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Geo permission</span>
          <span className="font-mono">{permState}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <button className={btn} onClick={getGps}>
          1 · Get GPS
        </button>
        <div className={row}>
          <span className="text-slate-400 text-xs">getCurrentPosition()</span>
          <span className="font-mono text-sm break-all">{gps}</span>
        </div>

        <button className={btn} onClick={() => fileInput.current?.click()}>
          2 · Take Photo
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPhoto}
        />
        {photo && (
          <div className={row}>
            <span className="font-mono text-sm">Original: {kb(photo.size)}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="captured" className="max-h-48 rounded object-contain" />
          </div>
        )}

        <button className={btn} onClick={compress} disabled={!photo}>
          3 · Compress (1920px / q85)
        </button>
        {compressed && (
          <div className={row}>
            <span className="font-mono text-sm">
              Compressed: {kb(compressed.size)} ({compressed.w}×{compressed.h})
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={compressed.url} alt="compressed" className="max-h-48 rounded object-contain" />
          </div>
        )}
      </section>

      <section className={row}>
        <span className="text-slate-400 text-xs">Event log (newest first, device-local time) — screenshot this</span>
        <div className="max-h-60 overflow-auto font-mono text-xs leading-relaxed">
          {log.length === 0 && <span className="text-slate-500">no events yet</span>}
          {log.map((l, i) => (
            <div key={i}>
              <span className="text-slate-500">{l.t}</span> {l.msg}
            </div>
          ))}
        </div>
      </section>

      <details className="text-xs text-slate-500">
        <summary>User agent</summary>
        <p className="break-all font-mono">{ua}</p>
      </details>
    </main>
  );
}
