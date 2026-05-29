import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/SignOutButton";
import { OnlineStatus } from "@/components/OnlineStatus";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PropertyPicker } from "@/components/PropertyPicker";
import {
  accessibleProperties,
  isAdmin,
  isPortfolioRole,
  requireUser,
} from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";

// Authed home — Week-1 DoD: sign-in -> "Hello, name" works end-to-end.
// Route protection via requireUser() (server-side auth()); per-route RBAC for
// admin/manager surfaces lives in their own layouts (lib/rbac).
export default async function Home() {
  const user = await requireUser();
  const t = await getTranslations("Home");

  // Header property picker (ADR-013): shown only for scoped users with 2+
  // properties. Portfolio roles (CORPORATE/ADMIN) default to the whole portfolio.
  const properties = await accessibleProperties(user);
  const showPicker = !isPortfolioRole(user.role) && properties.length > 1;
  const currentPropertyId = showPicker
    ? await getCurrentPropertyId(properties.map((p) => p.id))
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("greeting", { name: user.name })}
          </h1>
          <p className="text-sm text-slate-500">
            {t("role")}: {user.role}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OnlineStatus />
          {showPicker && (
            <PropertyPicker properties={properties} current={currentPropertyId} />
          )}
          <SignOutButton />
        </div>
      </header>

      {isAdmin(user.role) && (
        <Link
          href="/admin/users"
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Admin console →
        </Link>
      )}

      <InstallPrompt />

      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        {t("placeholder")}
      </div>
    </main>
  );
}
