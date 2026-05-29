"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Header connectivity indicator. Field staff work in rooms with variable Wi-Fi,
// so a visible online/offline state matters (ADR: offline is an edge case but
// must be legible). Bilingual via next-intl since this shows on field surfaces.
export function OnlineStatus() {
  // Default to online for SSR; correct on mount + on connectivity events.
  const [online, setOnline] = useState(true);
  const t = useTranslations("Common");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      {online ? t("online") : t("offline")}
    </span>
  );
}
