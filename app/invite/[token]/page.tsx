import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InviteKind, Locale } from "@prisma/client";
import { db } from "@/lib/db";
import { hashInviteToken, inviteState } from "@/lib/invite";
import { consentCopy } from "@/lib/consent-copy";
import { InviteClient } from "./InviteClient";

export const metadata: Metadata = {
  title: "Invitation — StayCheck",
};

// Never statically prerendered — the token lookup must run per-request.
export const dynamic = "force-dynamic";

// PUBLIC, unauthenticated invite-acceptance page (Spec B / ADR-025 T7).
//
// Serves two invite kinds from one URL shape: ACCOUNT (a staff member sets
// their own password) and CONSENT_ONLY (a contractor confirms their number and
// optionally ticks the messaging-consent box). Deliberately bare — no app
// shell, no nav (lib/nav.ts SHELL_HIDE_PREFIXES) — this visitor has no session.
//
// Every non-valid state (not found, expired, consumed, revoked, or a
// deactivated target) renders the identical generic notice below. Do NOT add
// a differentiated message here — see acceptInvite's doc comment for why.
async function InvalidNotice() {
  const t = await getTranslations("Invite");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("invalidBody")}</p>
      </div>
    </main>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await db.inviteToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      kind: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
      user: { select: { email: true, locale: true, phone: true, active: true } },
      contractor: { select: { language: true, whatsapp: true, active: true } },
    },
  });

  if (!invite || inviteState(invite, new Date()) !== "valid") {
    return <InvalidNotice />;
  }

  let email: string | null = null;
  let defaultLocale: Locale = Locale.en;
  let existingPhone: string | null = null;

  if (invite.kind === InviteKind.ACCOUNT) {
    // Defensive: schema only enforces "exactly one of userId/contractorId set
    // matching kind" at the action layer, not via a DB check constraint.
    if (!invite.user || !invite.user.active) return <InvalidNotice />;
    email = invite.user.email;
    defaultLocale = invite.user.locale;
    existingPhone = invite.user.phone;
  } else {
    if (!invite.contractor || !invite.contractor.active) return <InvalidNotice />;
    defaultLocale = invite.contractor.language;
    existingPhone = invite.contractor.whatsapp;
  }

  return (
    <InviteClient
      token={token}
      kind={invite.kind}
      email={email}
      defaultLocale={defaultLocale}
      existingPhone={existingPhone}
      consentTextEn={consentCopy("en")}
      consentTextEs={consentCopy("es")}
    />
  );
}
