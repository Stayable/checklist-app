// components/shell/NavIcon.tsx
"use client";

import {
  ChevronRight,
  HardHat,
  House,
  Network,
  Settings,
  SquareCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// lib/nav.ts stores icons as KEY STRINGS so it stays importable from the server
// without dragging JSX in. This is the only place those keys become components.
// An explicit map, not a dynamic lookup on the lucide barrel: it keeps the
// bundle to the six icons actually used and makes an unknown key a visible
// fallback rather than a crash.
const ICONS: Record<string, LucideIcon> = {
  House,
  SquareCheck,
  Network,
  Wrench,
  HardHat,
  Settings,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? ChevronRight;
  return <Icon className={className} aria-hidden />;
}
