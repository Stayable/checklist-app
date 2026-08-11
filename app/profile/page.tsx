import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProfileClient } from "./ProfileClient";

// Self-service profile — any signed-in user views their account and changes
// their own password. Bilingual per ADR-013 (field staff reach this surface).
export default async function ProfilePage() {
  // allowPasswordChange: this page is the ONLY way out of a forced password
  // change, so it must not be redirected by the guard that forces one.
  const sessionUser = await requireUser({ allowPasswordChange: true });
  const t = await getTranslations("Profile");
  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { name: true, email: true, mustChangePassword: true },
  });

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {user?.mustChangePassword && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">{t("mustChangeTitle")}</p>
          <p className="mt-0.5">{t("mustChangeBody")}</p>
        </div>
      )}
      <section className="rounded-lg bg-white p-4 text-sm ring-1 ring-slate-200">
        <dl className="grid grid-cols-3 gap-y-2">
          <dt className="text-slate-500">{t("name")}</dt>
          <dd className="col-span-2 font-medium text-slate-900">{user?.name}</dd>
          <dt className="text-slate-500">{t("email")}</dt>
          <dd className="col-span-2 text-slate-700">{user?.email}</dd>
        </dl>
      </section>
      <ProfileClient />
    </div>
  );
}
