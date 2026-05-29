import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Authorization helpers (ADR-013). One global role per user; portfolio-wide
// access for CORPORATE/ADMIN, otherwise gated by user_properties membership.

export type SessionUser = {
  id: string;
  role: Role;
  name: string;
};

/** CORPORATE and ADMIN see every property; everyone else is scoped. */
export function isPortfolioRole(role: Role): boolean {
  return role === Role.CORPORATE || role === Role.ADMIN;
}

export function isAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}

/** Manager and above (manager, corporate, admin) — review/management surfaces. */
export function isManagerOrAbove(role: Role): boolean {
  return role === Role.MANAGER || isPortfolioRole(role);
}

/**
 * Current session user, or redirect to /login. Use at the top of any protected
 * server component or server action.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return {
    id: session.user.id,
    role: session.user.role,
    name: session.user.name ?? "",
  };
}

/** Require ADMIN; non-admins are bounced to the home page. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect("/");
  return user;
}

/** Require manager-or-above; field staff are bounced to the home page. */
export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isManagerOrAbove(user.role)) redirect("/");
  return user;
}

/**
 * True iff the user may access the given property. Portfolio roles always pass;
 * others must have a user_properties row. `db.Uuid` property primary key.
 */
export async function canAccessProperty(
  user: Pick<SessionUser, "id" | "role">,
  propertyId: string,
): Promise<boolean> {
  if (isPortfolioRole(user.role)) return true;
  const membership = await db.userProperty.findUnique({
    where: { userId_propertyId: { userId: user.id, propertyId } },
    select: { userId: true },
  });
  return membership !== null;
}

/**
 * Property IDs (primary keys) the user can access. Portfolio roles get every
 * active property; scoped users get their assigned set. Drives the header
 * property picker and any property-scoped list query.
 */
export async function accessiblePropertyIds(
  user: Pick<SessionUser, "id" | "role">,
): Promise<string[]> {
  if (isPortfolioRole(user.role)) {
    const all = await db.property.findMany({
      where: { active: true },
      select: { id: true },
    });
    return all.map((p) => p.id);
  }
  const links = await db.userProperty.findMany({
    where: { userId: user.id },
    select: { propertyId: true },
  });
  return links.map((l) => l.propertyId);
}

export type PickerProperty = { id: string; shortCode: string; name: string };

/**
 * Accessible properties with display labels, short-code-sorted, for the header
 * property picker. Portfolio roles get the full active portfolio.
 */
export async function accessibleProperties(
  user: Pick<SessionUser, "id" | "role">,
): Promise<PickerProperty[]> {
  const where = isPortfolioRole(user.role)
    ? { active: true }
    : { active: true, users: { some: { userId: user.id } } };
  return db.property.findMany({
    where,
    select: { id: true, shortCode: true, name: true },
    orderBy: { shortCode: "asc" },
  });
}
