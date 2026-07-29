"use server";

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ConsentChannel, InviteKind, Locale, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashInviteToken, inviteState } from "@/lib/invite";
import { normalizePhone } from "@/lib/phone";
import { validatePasswordStrength } from "@/lib/password";
import { CONSENT_CHANNELS, POLICY_VERSION, consentCopy } from "@/lib/consent-copy";

// Public, unauthenticated accept action for a single-use invite (Spec B /
// ADR-025 T7). Two invite kinds share this one action: ACCOUNT sets a
// password for a staff User; CONSENT_ONLY only records a Contractor's own
// phone + optional messaging consent. Neither path creates a new record —
// the row (User or Contractor) already exists; the invite just lets its
// owner set their own credentials / tick their own box.

const BCRYPT_COST = 12;

/**
 * Error CODES only — never English prose. This is a bilingual field/contractor
 * surface (ADR-013: notification/UI text targeting field staff must be
 * translated regardless of which surface generated it), so the client maps
 * each code to a localized string via next-intl (`Invite.errors.*`).
 *
 * "generic" is deliberately reused for every invalid-invite condition — not
 * found, expired, consumed, revoked, or a deactivated target. This endpoint is
 * unauthenticated, so a differentiated message would turn it into an oracle
 * an attacker could use to probe which invites/accounts exist (spec §10).
 */
export type AcceptErrorCode =
  | "invalid_input"
  | "generic"
  | "invalid_phone"
  | "weak_password"
  | "phone_taken"
  | "server_error";

export type AcceptResult = { ok: true } | { ok: false; error: AcceptErrorCode };

const schema = z.object({
  token: z.string().min(1),
  phone: z.string().min(1),
  locale: z.nativeEnum(Locale),
  consent: z.boolean(),
  // Only required for ACCOUNT invites; checked below once the kind is known —
  // a CONSENT_ONLY submission never carries a password at all.
  password: z.string().optional(),
});

export async function acceptInvite(input: unknown): Promise<AcceptResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { token, phone, locale, consent, password } = parsed.data;

  const invite = await db.inviteToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      id: true,
      kind: true,
      userId: true,
      contractorId: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
      createdByUserId: true,
      user: { select: { active: true } },
      contractor: { select: { active: true } },
    },
  });
  if (!invite) return { ok: false, error: "generic" };
  if (inviteState(invite, new Date()) !== "valid") return { ok: false, error: "generic" };
  // A deactivated target must not be reactivatable via an outstanding invite.
  if (invite.user && !invite.user.active) return { ok: false, error: "generic" };
  if (invite.contractor && !invite.contractor.active) return { ok: false, error: "generic" };

  const normalized = normalizePhone(phone);
  if (!normalized.ok) return { ok: false, error: "invalid_phone" };
  const e164 = normalized.e164;

  if (invite.kind === InviteKind.ACCOUNT) {
    if (!password || validatePasswordStrength(password)) {
      return { ok: false, error: "weak_password" };
    }
    const clash = await db.user.findFirst({
      where: { phoneE164: e164, NOT: { id: invite.userId! } },
      select: { id: true },
    });
    // Do NOT reveal whose number it is.
    if (clash) return { ok: false, error: "phone_taken" };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;
  const text = consentCopy(locale === Locale.es ? "es" : "en");

  const consentRows = consent
    ? CONSENT_CHANNELS.map((channel: ConsentChannel) => ({
        userId: invite.userId,
        contractorId: invite.contractorId,
        channel,
        phoneE164: e164,
        consentText: text,
        policyVersion: POLICY_VERSION,
        locale,
        ipAddress: ip,
        userAgent,
      }))
    : [];

  try {
    await db.$transaction(async (tx) => {
      // Re-check consumption inside the transaction so two concurrent tabs
      // (or a resubmit + the original) cannot both win.
      const fresh = await tx.inviteToken.updateMany({
        where: { id: invite.id, consumedAt: null, revokedAt: null },
        data: { consumedAt: new Date() },
      });
      if (fresh.count !== 1) throw new Error("already_consumed");

      if (invite.kind === InviteKind.ACCOUNT) {
        await tx.user.update({
          where: { id: invite.userId! },
          data: {
            passwordHash: await bcrypt.hash(password!, BCRYPT_COST),
            phone,
            phoneE164: e164,
            locale,
            failedLoginAttempts: 0,
            lastFailedLoginAt: null,
            lockedUntil: null,
          },
        });
      } else {
        await tx.contractor.update({
          where: { id: invite.contractorId! },
          data: { whatsapp: e164, language: locale },
        });
      }

      if (consentRows.length > 0) await tx.consentRecord.createMany({ data: consentRows });

      // audit_log.actorUserId is non-null and FK-constrained. A CONSENT_ONLY
      // invite has no userId (no account exists), so the accept is attributed
      // to the admin/manager who created the invite instead of to nobody.
      const after: Prisma.InputJsonValue = {
        consent,
        channels: consent ? [...CONSENT_CHANNELS] : [],
        policyVersion: POLICY_VERSION,
      };
      await tx.auditLog.create({
        data: {
          actorUserId: invite.userId ?? invite.createdByUserId,
          entityType: invite.kind === InviteKind.ACCOUNT ? "user" : "contractor",
          entityId: invite.userId ?? invite.contractorId!,
          action: "accept_invite",
          after,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "already_consumed") {
      return { ok: false, error: "generic" };
    }
    return { ok: false, error: "server_error" };
  }

  return { ok: true };
}
