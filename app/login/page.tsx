"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/i18n/config";

export default function LoginPage() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (!res || res.error) {
      setError(true);
      return;
    }
    router.push("/");
    router.refresh();
  }

  // Login is a field-staff surface, so it is bilingual (ADR-013). Persist the
  // choice in the same cookie the middleware reads.
  function switchLocale(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex justify-end gap-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => switchLocale(l)}
              className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                l === locale ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            {t("email")}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            {t("password")}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-11 text-base text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {t("error")}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? t("signingIn") : t("signIn")}
          </button>
        </form>
      </div>
    </main>
  );
}
