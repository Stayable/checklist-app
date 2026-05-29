"use server";

import { Locale } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

// Persist a field-staff user's language choice (ADR-013 first-login prompt).
// Saves to users.locale; the cookie that drives next-intl is set client-side.
export async function setMyLocale(locale: Locale): Promise<void> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { locale } });
}
