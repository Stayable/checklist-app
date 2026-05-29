"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Locale, Role } from "@prisma/client";
import { LOCALE_COOKIE } from "@/i18n/config";
import { setMyLocale } from "@/app/locale-actions";

const FIELD_ROLES: Role[] = [Role.HK, Role.PA, Role.MT];
const CHOSEN_COOKIE = "locale_chosen";

// First-login language prompt for field staff (ADR-013). Shown once until the
// user picks; the choice is saved to users.locale and the next-intl cookie.
// Admin/manager/corporate stay English-only and never see this.
export function LocalePrompt({ role }: { role: Role }) {
  const t = useTranslations("Locale");
  const router = useRouter();
  const alreadyChosen =
    typeof document !== "undefined" && document.cookie.includes(`${CHOSEN_COOKIE}=1`);
  const [dismissed, setDismissed] = useState(alreadyChosen);

  if (!FIELD_ROLES.includes(role) || dismissed) return null;

  function choose(locale: Locale) {
    const year = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${year}; samesite=lax`;
    document.cookie = `${CHOSEN_COOKIE}=1; path=/; max-age=${year}; samesite=lax`;
    setDismissed(true);
    void setMyLocale(locale);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">{t("choosePrompt")}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => choose(Locale.en)}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("english")}
        </button>
        <button
          onClick={() => choose(Locale.es)}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("spanish")}
        </button>
      </div>
    </div>
  );
}
