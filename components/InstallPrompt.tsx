"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Chrome/Android fire `beforeinstallprompt`; we capture it and trigger natively.
// iOS/Safari has no such event — the only path is the manual Share → Add to Home
// Screen flow, so we detect iOS and show step-by-step guidance instead.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as Mac; disambiguate via touch points.
  const iPadOnMac = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return iDevice || iPadOnMac;
}

/**
 * Install affordance. Renders nothing when already installed (standalone).
 * `variant="banner"` is the compact home-screen nudge; `variant="full"` shows
 * the complete iOS step list and is used on the dedicated /install page.
 */
export function InstallPrompt({ variant = "banner" }: { variant?: "banner" | "full" }) {
  const t = useTranslations("Install");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we drive the UI
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already installed — nothing to prompt.
  if (standalone) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  // Android/Chrome path: a single native install button.
  if (deferred) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">{t("ctaTitle")}</p>
        <button
          type="button"
          onClick={install}
          className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-800"
        >
          {t("installButton")}
        </button>
      </div>
    );
  }

  // iOS path: manual Add-to-Home-Screen instructions.
  if (ios) {
    const steps = [t("iosStep1"), t("iosStep2"), t("iosStep3")];
    if (variant === "banner") {
      return (
        <a
          href="/install"
          className="block rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t("iosBanner")}
        </a>
      );
    }
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">{t("iosTitle")}</p>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-slate-600">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
    );
  }

  // Other browsers with no install support (e.g. desktop Firefox) — stay quiet.
  return null;
}
