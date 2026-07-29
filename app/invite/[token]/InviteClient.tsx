"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { InviteKind, Locale } from "@prisma/client";
import { LOCALES, LOCALE_COOKIE, type Locale as UiLocale } from "@/i18n/config";
import { acceptInvite, type AcceptErrorCode } from "./actions";

// Draft — confirm the real published path before relying on this link (spec
// open item O2: the rentstayable.com privacy policy doesn't yet carry the
// disclosures Twilio requires; someone still has to publish it).
const PRIVACY_POLICY_URL = "https://www.rentstayable.com/privacy-policy";

type ClientErrorCode = AcceptErrorCode | "password_mismatch";

type Props = {
  token: string;
  kind: InviteKind;
  email: string | null;
  defaultLocale: Locale;
  existingPhone: string | null;
  consentTextEn: string;
  consentTextEs: string;
};

export function InviteClient({
  token,
  kind,
  email,
  defaultLocale,
  existingPhone,
  consentTextEn,
  consentTextEs,
}: Props) {
  const t = useTranslations("Invite");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [phone, setPhone] = useState(existingPhone ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Consent is OPTIONAL and starts unchecked — plain useState(false), no
  // defaultChecked. It is read only at submit time and never disables the
  // submit button: mandatory consent, or a pre-ticked box, would make the
  // resulting "opt-in" coercive and void as Twilio evidence (spec §5.1).
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState<ClientErrorCode | null>(null);
  const [done, setDone] = useState(false);

  const consentText = locale === "es" ? consentTextEs : consentTextEn;

  function switchLocale(next: UiLocale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  // One-time nudge to the invitee's own known language (the contractor's
  // Contractor.language, or the staff member's users.locale) so a
  // Spanish-speaking contractor doesn't land on an English page before ever
  // touching the toggle. Fires once on mount; the buttons take it from there.
  useEffect(() => {
    if (locale !== defaultLocale) switchLocale(defaultLocale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (kind === InviteKind.ACCOUNT && password !== confirmPassword) {
      setError("password_mismatch");
      return;
    }

    startTransition(async () => {
      const res = await acceptInvite({
        token,
        phone,
        locale: locale === "es" ? Locale.es : Locale.en,
        consent,
        password: kind === InviteKind.ACCOUNT ? password : undefined,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      if (kind === InviteKind.ACCOUNT) {
        router.push("/login?activated=1");
      } else {
        setDone(true);
      }
    });
  }

  const LocaleSwitcher = (
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
  );

  if (done) {
    // CONSENT_ONLY only reaches here — there is no account to log into, so
    // this is a standalone confirmation rather than a redirect.
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          {LocaleSwitcher}
          <h1 className="text-xl font-bold text-slate-900">{t("thankYouTitle")}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("thankYouBody")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {LocaleSwitcher}

        <h1 className="text-xl font-bold text-slate-900">
          {kind === InviteKind.ACCOUNT ? t("accountTitle") : t("consentOnlyTitle")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {kind === InviteKind.ACCOUNT ? t("accountSubtitle") : t("consentOnlySubtitle")}
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          {kind === InviteKind.ACCOUNT && email && (
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              {t("emailLabel")}
              <input
                type="email"
                value={email}
                readOnly
                disabled
                className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-base text-slate-500"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            {t("phoneLabel")}
            <input
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-slate-900 focus:outline-none"
            />
            <span className="text-xs font-normal text-slate-400">{t("phoneHelper")}</span>
          </label>

          {kind === InviteKind.ACCOUNT && (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                {t("passwordLabel")}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
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

              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                {t("confirmPasswordLabel")}
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </label>
            </>
          )}

          {/* Consent — unchecked by default, never disables submit. The label
              renders the verbatim legal text as-is (lib/consent-copy.ts); the
              disclosure links live in the row underneath rather than being
              spliced into that string, so the persisted consentText can never
              drift from what a carrier/Meta challenge would need to see. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
              />
              <span>{consentText}</span>
            </label>
            <p className="mt-2 pl-7 text-xs text-slate-400">
              <Link href="/legal/messaging" className="underline hover:text-slate-600">
                {t("messagingDisclosuresLink")}
              </Link>
              {" · "}
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-slate-600"
              >
                {t("privacyPolicyLink")}
              </a>
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {t(`errors.${error}`)}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-lg bg-navy px-4 py-3 text-base font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {pending
              ? t("submitting")
              : kind === InviteKind.ACCOUNT
                ? t("submitAccount")
                : t("submitConsentOnly")}
          </button>
        </form>
      </div>
    </main>
  );
}
