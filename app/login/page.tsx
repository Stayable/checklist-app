"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { requestLogin, submitOtp, resendOtp, type LoginResult } from "./actions";

type Step = "password" | "otp";

export default function LoginPage() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();

  // Core form state — email+password are kept across both steps intentionally.
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  // UI feedback
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  /** Set once a password submit has come back rejected. Gates the reset link so
   *  it appears on the first failure rather than sitting there from the start. */
  const [attempted, setAttempted] = useState(false);

  /** A lockout gets a specific message with the wait time; everything else stays
   *  deliberately generic so a failure can't be attributed to the email or the
   *  password. Falls back to the generic text if the server ever reports
   *  "locked" without a duration, so the user is never shown a blank wait. */
  function errorText(res: Extract<LoginResult, { ok: false }>): string {
    if (res.error === "locked" && typeof res.lockedMinutes === "number") {
      return t("lockedError", { minutes: res.lockedMinutes });
    }
    return t("error");
  }

  // Login is a field-staff surface, so it is bilingual (ADR-013). Persist the
  // choice in the same cookie the middleware reads.
  function switchLocale(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  async function onPasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Read the DOM, not React state. A saved credential filled by the browser
    // or a password manager does not always fire a React change event — Chrome
    // and Safari both restore values on load without one — so `email` and
    // `password` can still be "" while the boxes look filled. The form then
    // submits empty strings, the server records a failed attempt, and the user
    // sees "invalid password" against a field showing their correct password.
    // `required` does not catch it: the DOM input is genuinely non-empty.
    // Suspected in Erika's 2026-09-08 failures; not reproduced in a browser.
    const form = new FormData(e.currentTarget);
    const emailValue = String(form.get("email") ?? "").trim() || email;
    const passwordValue = String(form.get("password") ?? "") || password;
    // Keep state in step so the OTP step, which re-sends both, agrees.
    setEmail(emailValue);
    setPassword(passwordValue);

    const res = await requestLogin(emailValue, passwordValue);
    setLoading(false);

    if (res.ok === true) {
      router.push(res.redirect);
      router.refresh();
    } else if (res.ok === "otp") {
      setStep("otp");
    } else {
      setError(errorText(res));
      // Includes "locked": a lock is reached by repeated wrong passwords, so a
      // reset is usually the real fix rather than waiting out the 30 minutes.
      setAttempted(true);
    }
  }

  async function onOtpSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResendMsg(null);

    const res = await submitOtp(email, password, code);
    setLoading(false);

    if (res.ok === true) {
      router.push(res.redirect);
      router.refresh();
    } else {
      setError(t("otpError"));
    }
  }

  async function onResend() {
    setResendMsg(null);
    setError(null);
    setLoading(true);

    const res = await resendOtp(email, password);
    setLoading(false);

    if (res.ok === "otp" || res.ok === true) {
      setResendMsg(t("otpSent"));
      setCode("");
    } else if (res.ok === false && res.error === "email_failed") {
      setResendMsg(t("emailFailed"));
    } else {
      setError(errorText(res));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Locale switcher — visible on both steps */}
        <div className="mb-6 flex justify-end gap-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => switchLocale(l)}
              className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                l === locale ? "bg-navy text-white" : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {step === "password" ? (
          <>
            <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>

            <form onSubmit={onPasswordSubmit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                {t("email")}
                <input
                  type="email"
                  name="email"
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
                    name="password"
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
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-lg bg-navy px-4 py-3 text-base font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
              >
                {loading ? t("signingIn") : t("signIn")}
              </button>

              {/* Shown from the FIRST failed attempt, not after several (Kyle,
                  2026-09-08). The case that prompted it was someone whose
                  password had been changed from the admin side: retrying is
                  guaranteed to fail, so the only useful thing on the screen is
                  the way out. Offering it before any failure would push people
                  into a reset they do not need — hence `attempted`, not
                  always-on. Carries the typed email so they do not retype it. */}
              {attempted && (
                <Link
                  href={{
                    pathname: "/forgot-password",
                    query: email.trim() ? { email: email.trim() } : undefined,
                  }}
                  className="text-center text-sm font-semibold text-navy underline hover:opacity-80"
                >
                  {t("forgotPassword")}
                </Link>
              )}
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900">{t("otpTitle")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("otpSubtitle")}</p>

            <form onSubmit={onOtpSubmit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                {t("otpLabel")}
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]*"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 tracking-widest focus:border-slate-900 focus:outline-none"
                />
              </label>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              {resendMsg && (
                <p className="text-sm text-slate-600">{resendMsg}</p>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="mt-2 rounded-lg bg-navy px-4 py-3 text-base font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
              >
                {loading ? t("signingIn") : t("otpVerify")}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={onResend}
                className="text-sm text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
              >
                {t("otpResend")}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
