"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@prisma/client";

// Connecteam-familiar bottom tab bar (ADR-017): the multi-surface navigation
// field managers already know, in the Stayable navy skin. Rendered only for
// roles with >1 surface (managers+); field staff have a single "Today" surface
// so they get no bar. Hidden on full-screen / non-app routes.
//
// Structural pass only — visual polish waits on the Claude Design pass + Kate's
// branding kit. Manager surfaces are English-only in v1 (ADR-013), so labels
// here are not translated.

type Tab = { href: string; label: string; match: (p: string) => boolean; icon: React.ReactNode };

const HIDE_PREFIXES = ["/login", "/install", "/ios-spike", "/photo-test", "/checklists", "/admin"];

function managerTabs(): Tab[] {
  return [
    { href: "/", label: "Today", match: (p) => p === "/", icon: <HomeIcon /> },
    { href: "/review", label: "Review", match: (p) => p.startsWith("/review"), icon: <ClipboardIcon /> },
    { href: "/issues", label: "Issues", match: (p) => p.startsWith("/issues"), icon: <FlagIcon /> },
  ];
}

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();

  const isManagerPlus =
    role === Role.MANAGER || role === Role.CORPORATE || role === Role.ADMIN;
  if (!isManagerPlus) return null;
  if (HIDE_PREFIXES.some((p) => pathname.startsWith(p) && pathname !== "/")) return null;

  const tabs = managerTabs();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-semibold ${
                active ? "text-navy" : "text-slate-400"
              }`}
            >
              <span className={active ? "text-navy" : "text-slate-400"}>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Inline stroke icons — no icon dependency, easy to swap for branded glyphs in
// the Claude Design pass.
function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 4 2 4H5" />
    </svg>
  );
}
