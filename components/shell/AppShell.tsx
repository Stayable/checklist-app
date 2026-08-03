// components/shell/AppShell.tsx
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { accessibleProperties, isPortfolioRole } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { NAV_COLLAPSED_COOKIE, navSectionsForRole } from "@/lib/nav";
import { ShellChrome } from "./ShellChrome";

// Server wrapper mounted once in the root layout. Unauthenticated requests
// render bare (login etc.). For authenticated users it gathers nav data and
// hands off to the client ShellChrome. The pathname-based hide of standalone
// routes happens inside ShellChrome (client).
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) return <>{children}</>;

  const role = session.user.role;
  const properties = await accessibleProperties({ id: session.user.id, role });
  const showPicker = !isPortfolioRole(role) && properties.length > 1;
  const currentPropertyId = showPicker
    ? await getCurrentPropertyId(properties.map((p) => p.id))
    : null;

  // Rail width is decided HERE, not in an effect: the sidebar is fixed, so
  // choosing the width on the client paints the wrong one first and the content
  // jumps on every navigation.
  const jar = await cookies();
  const initialCollapsed = jar.get(NAV_COLLAPSED_COOKIE)?.value === "1";

  return (
    <ShellChrome
      name={session.user.name ?? ""}
      role={role}
      sections={navSectionsForRole(role)}
      properties={properties}
      currentPropertyId={currentPropertyId}
      showPicker={showPicker}
      initialCollapsed={initialCollapsed}
    >
      {children}
    </ShellChrome>
  );
}
