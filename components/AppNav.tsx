import { auth } from "@/lib/auth";
import { BottomNav } from "./BottomNav";

// Server wrapper: reads the session role and renders the client BottomNav.
// Returns null for unauthenticated requests (e.g. /login), so it's safe to
// mount once in the root layout.
export async function AppNav() {
  const session = await auth();
  if (!session?.user) return null;
  return <BottomNav role={session.user.role} />;
}
