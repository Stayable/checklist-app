import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstallPrompt } from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title: "Install — StayCheck",
};

// Dedicated install guide. Field-staff surface, so bilingual (ADR-013). Linked
// from the iOS banner on the home screen where the native prompt is unavailable.
export default async function InstallPage() {
  const t = await getTranslations("Install");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pageSubtitle")}</p>
      </header>

      <InstallPrompt variant="full" />

      <p className="text-xs text-slate-400">{t("alreadyInstalled")}</p>
    </main>
  );
}
