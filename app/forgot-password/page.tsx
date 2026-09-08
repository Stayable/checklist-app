"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/i18n/config";
// Rules module, not lib/password — the latter imports node `crypto`.
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { requestPasswordReset, confirmPasswordReset } from "./actions";

type Step = "email" | "code";

// Password reset is a field-staff surface, so it is bilingual (ADR-013) and
// laid out to match /login rather than inventing a second visual language for
// the same moment.
function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<Step>("email");
  // Prefilled from the login form's link so a person who just failed a sign-in
  // does not retype the address they already typed.
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function switchLocale(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  async function onEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    // Same autofill hazard as /login: a browser-restored value may never reach
    // React state, so trust the DOM and sync state from it.
    const form = new FormData(e.currentTarget);
    const emailValue = String(form.get("email") ?? "").trim() || email;
    setEmail(emailValue);

    const res = await requestPasswordReset(emailValue);
    setLoading(false);

    if (res.ok) {
      // Advance even though the address may not resolve to an account. The
      // server deliberately cannot tell us, and a screen that only advanced for
      // real accounts would leak exactly what the server refused to.
      setStep("code");
      return;
    }
    if (res.error === "invalid_email") setError(t("resetBadEmail"));
    else if (res.error === "throttled") setError(t("resetThrottled"));
    else setError(t("emailFailed"));
  }

  async function onCodeSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const res = await confirmPasswordReset(email, code, password);
    setLoading(false);

    if (res.ok) {
      setDone(true);
      return;
    }
    setError(res.error === "weak" ? (res.message ?? t("resetWeak")) : t("resetCodeError"));
  }

  async function onResend() {
    setLoading(true);
    setError(null);
    setNotice(null);

    const res = await requestPasswordReset(email);
    setLoading(false);

    if (res.ok) {
      setNotice(t("otpSent"));
      setCode("");
    } else if (res.error === "throttled") {
      setError(t("resetThrottled"));
    } else {
      setError(t("emailFailed"));
    }
  }

  const card =
    "w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
  const input =
    "rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-slate-900 focus:outline-none";
  const primary =
    "mt-2 rounded-lg bg-navy px-4 py-3 text-base font-semibold text-white hover:bg-navy/90 disabled:opacity-50";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className={card}>
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

        {done ? (
          <>
            <h1 className="text-xl font-bold text-slate-900">{t("resetDoneTitle")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("resetDoneSubtitle")}</p>
            <Link href="/login" className={`${primary} mt-6 block text-center`}>
              {t("signIn")}
            </Link>
          </>
        ) : step === "email" ? (
          <>
            <h1 className="text-xl font-bold text-slate-900">{t("resetTitle")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("resetSubtitle")}</p>

            <form onSubmit={onEmailSubmit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                {t("email")}
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={input}
                />
              </label>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className={primary}>
                {loading ? t("resetSending") : t("resetSend")}
              </button>

              <Link
                href="/login"
                className="text-center text-sm text-slate-500 underline hover:text-slate-700"
              >
                {t("resetBackToSignIn")}
              </Link>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900">{t("resetCodeTitle")}</h1>
            {/* Worded so it holds whether or not the address resolved — the one
                place this screen could otherwise give the answer away. */}
            <p className="mt-1 text-sm text-slate-500">{t("resetCodeSubtitle")}</p>

            <form onSubmit={onCodeSubmit} className="mt-6 flex flex-col gap-4">
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
                  className={`${input} tracking-widest`}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                {t("resetNewPassword")}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full ${input} pr-11`}
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
              <p className="text-xs text-slate-500">
                {t("resetPasswordHint", { min: MIN_PASSWORD_LENGTH })}
              </p>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              {notice && <p className="text-sm text-slate-600">{notice}</p>}

              <button
                type="submit"
                disabled={loading || code.length !== 6 || password.length < MIN_PASSWORD_LENGTH}
                className={primary}
              >
                {loading ? t("resetSaving") : t("resetSubmit")}
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

// useSearchParams needs a Suspense boundary to keep this page from opting the
// whole route into dynamic rendering at build time.
export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
