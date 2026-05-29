import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { OnlineStatus } from "@/components/OnlineStatus";
import { InstallPrompt } from "@/components/InstallPrompt";

// Authed home — Week-1 DoD: sign-in -> "Hello, name" works end-to-end.
// Route protection lives here (server-side auth()) rather than middleware for
// v1; full RBAC middleware is a Phase 2 task.
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("Home");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("greeting", { name: session.user.name ?? "" })}
          </h1>
          <p className="text-sm text-slate-500">
            {t("role")}: {session.user.role}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OnlineStatus />
          <SignOutButton />
        </div>
      </header>

      <InstallPrompt />

      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        {t("placeholder")}
      </div>
    </main>
  );
}
