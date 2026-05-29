"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import exifr from "exifr";
import {
  compressImage,
  getCurrentPosition,
  type CompressedImage,
  type Position,
} from "@/lib/image";

// Photo capture POC (TODO.md Phase 1, Fri). Exercises the real checklist photo
// pipeline end-to-end EXCEPT the R2 round-trip: native camera → compress →
// separate GPS → EXIF read. The upload step (presign + save to R2) is blocked on
// the R2 bucket + scoped tokens + CORS, so the "Upload" action is intentionally
// absent here; wire /api/photos/presign + /api/photos/save once R2 exists.

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function PhotoTestPage() {
  const t = useTranslations("Photo");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [compressed, setCompressed] = useState<(CompressedImage & { url: string }) | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsState, setGpsState] = useState<string>("—");
  const [exif, setExif] = useState<string>("—");

  const onPhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOriginal(file);
    setOriginalUrl(URL.createObjectURL(file));
    setCompressed(null);

    // EXIF read — iOS typically strips GPS, so this confirms why we capture GPS
    // separately. Show whatever the library can parse (often just dimensions).
    try {
      const parsed = await exifr.gps(file).catch(() => null);
      setExif(parsed ? `lat ${parsed.latitude}, lng ${parsed.longitude}` : "no EXIF GPS");
    } catch {
      setExif("EXIF parse failed");
    }
  }, []);

  const onCompress = useCallback(async () => {
    if (!original) return;
    const result = await compressImage(original);
    setCompressed({ ...result, url: URL.createObjectURL(result.blob) });
  }, [original]);

  const onLocate = useCallback(async () => {
    setGpsState(t("requesting"));
    try {
      const pos = await getCurrentPosition();
      setPosition(pos);
      setGpsState(`✅ ±${Math.round(pos.accuracy)}m`);
    } catch (err) {
      setGpsState(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [t]);

  const card = "rounded-xl border border-slate-200 bg-white p-4";
  const btn =
    "w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-40";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("testTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("testSubtitle")}</p>
      </header>

      <button className={btn} onClick={() => fileInput.current?.click()}>
        {t("takePhoto")}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPhoto}
      />

      {originalUrl && original ? (
        <div className={card}>
          <p className="text-sm font-medium text-slate-700">
            {t("original")}: {kb(original.size)}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={originalUrl} alt="captured" className="mt-2 max-h-56 rounded object-contain" />
          <p className="mt-2 font-mono text-xs text-slate-500">EXIF GPS: {exif}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-400">{t("noPhoto")}</p>
      )}

      <button className={btn} onClick={onCompress} disabled={!original}>
        {t("compress")}
      </button>
      {compressed && (
        <div className={card}>
          <p className="text-sm font-medium text-slate-700">
            {t("compressed")}: {kb(compressed.originalBytes)} → {kb(compressed.compressedBytes)} (
            {compressed.width}×{compressed.height})
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={compressed.url} alt="compressed" className="mt-2 max-h-56 rounded object-contain" />
        </div>
      )}

      <button className={btn} onClick={onLocate}>
        {t("getLocation")}
      </button>
      <div className={card}>
        <p className="text-sm font-medium text-slate-700">{t("location")}</p>
        <p className="font-mono text-sm text-slate-600 break-all">{gpsState}</p>
        {position && (
          <p className="font-mono text-xs text-slate-500 break-all">
            {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
          </p>
        )}
      </div>
    </main>
  );
}
