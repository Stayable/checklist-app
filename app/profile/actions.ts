"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { validatePasswordStrength } from "@/lib/password";

// Self-service password change. Returns machine error CODES (not prose) so the
// client renders them in the user's locale (ADR-013 bilingual for field staff).
export type ChangeResult =
  | { ok: true }
  | { ok: false; error: "invalid_input" | "weak" | "wrong_current" | "same" | "not_found" };

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
});

const BCRYPT_COST = 12;

export async function changeOwnPassword(input: unknown): Promise<ChangeResult> {
  const sessionUser = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { currentPassword, newPassword } = parsed.data;

  if (validatePasswordStrength(newPassword)) return { ok: false, error: "weak" };

  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, passwordHash: true },
  });
  if (!user) return { ok: false, error: "not_found" };

  const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentOk) return { ok: false, error: "wrong_current" };
  if (currentPassword === newPassword) return { ok: false, error: "same" };

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  await db.auditLog.create({
    data: {
      actorUserId: user.id,
      entityType: "user",
      entityId: user.id,
      action: "change_password",
    },
  });
  return { ok: true };
}
