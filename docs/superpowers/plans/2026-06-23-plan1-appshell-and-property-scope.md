# Plan 1 — Unified AppShell + Property Scope (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's two disjoint navigation systems (manager bottom bar + admin's own top header) and inconsistent page widths with one responsive AppShell — navy left sidebar on desktop, bottom tab bar on mobile — and make the active property a consistent global filter.

**Architecture:** A server `AppShell` (reads session + accessible properties) wraps every page in the root layout; a client `ShellChrome` handles pathname-based active state, responsive rendering, and hide-on-auth-routes. Two pure helpers (`lib/nav.ts`, `lib/property-scope.ts`) are unit-tested with Vitest; the visual shell and page migrations are verified by typecheck + lint + build + a branch Preview deploy.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict), Tailwind v4, next-intl, Vitest. No new dependencies.

## Global Constraints

- TypeScript strict mode; no `any` without a documented reason.
- Datetime display only through `lib/datetime.ts` (never `toLocaleString` directly) — ESLint-enforced.
- Brand tokens already in `globals.css`: navy `#041E42`, blue `#0091F5`, sky `#91D1FA`, gold `#FDDA24`; font Nunito. Use the existing `bg-navy` / `text-navy` utilities.
- Manager/Corporate/Admin surfaces are English-only (ADR-013); field-staff surfaces bilingual via next-intl. The shell chrome labels for manager/admin tabs are English (matches existing `BottomNav`).
- 2-letter property short codes are canonical in UI (JN/JW/KE/KW/LL/OR/SA/DP).
- Verify via Vercel deploys, not `pnpm dev` (standing preference). The working branch `claude/rise8-operations-platform-rv9B6` auto-deploys to a **Preview** URL on push; `main` is Production. Plan 1 ships to the branch Preview for Kate's visual review before any merge to `main`.
- Routes that must NOT show the shell: `/login`, `/install`, `/ios-spike`, `/photo-test`, `/checklists` (the fill runtime is reparented in a later plan — leave it standalone here).
- Nav links must only point to routes that exist after this plan (`/`, `/review`, `/issues`, `/rules`, `/admin/*`). Later plans add their own nav entries (`/completed`, `/dashboard`, `/templates`).

---

### Task 1: Nav model — pure, role-aware (`lib/nav.ts`)

Single source of truth for sidebar/bottom-bar items, active state, and shell-hide logic. Replaces the hard-coded `managerTabs()` in `components/BottomNav.tsx` and the hand-built header in `app/admin/layout.tsx`.

**Files:**
- Create: `lib/nav.ts`
- Test: `lib/nav.test.ts`

**Interfaces:**
- Consumes: `Role` from `@prisma/client`.
- Produces:
  - `type NavItem = { href: string; label: string; group: "main" | "admin" }`
  - `navItemsForRole(role: Role): NavItem[]`
  - `isNavItemActive(href: string, pathname: string): boolean`
  - `shouldHideShell(pathname: string): boolean`
  - `const SHELL_HIDE_PREFIXES: string[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/nav.test.ts
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  navItemsForRole,
  isNavItemActive,
  shouldHideShell,
} from "./nav";

describe("navItemsForRole", () => {
  it("field staff get only Today", () => {
    for (const r of [Role.HK, Role.PA, Role.MT]) {
      const items = navItemsForRole(r);
      expect(items.map((i) => i.href)).toEqual(["/"]);
    }
  });

  it("manager and corporate get the management surfaces, no admin group", () => {
    for (const r of [Role.MANAGER, Role.CORPORATE]) {
      const hrefs = navItemsForRole(r).map((i) => i.href);
      expect(hrefs).toEqual(["/", "/review", "/issues", "/rules"]);
      expect(navItemsForRole(r).some((i) => i.group === "admin")).toBe(false);
    }
  });

  it("admin gets management surfaces plus the admin group", () => {
    const items = navItemsForRole(Role.ADMIN);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toEqual([
      "/",
      "/review",
      "/issues",
      "/rules",
      "/admin/users",
      "/admin/templates",
      "/admin/sla",
      "/admin/properties",
    ]);
    expect(items.filter((i) => i.group === "admin")).toHaveLength(4);
  });
});

describe("isNavItemActive", () => {
  it("Today is active only on exact root", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/review")).toBe(false);
  });

  it("section items match by prefix", () => {
    expect(isNavItemActive("/review", "/review")).toBe(true);
    expect(isNavItemActive("/review", "/review/abc123")).toBe(true);
    expect(isNavItemActive("/issues", "/review/abc123")).toBe(false);
  });

  it("admin sub-items match their own prefix, not the whole /admin tree", () => {
    expect(isNavItemActive("/admin/users", "/admin/users")).toBe(true);
    expect(isNavItemActive("/admin/templates", "/admin/users")).toBe(false);
  });
});

describe("shouldHideShell", () => {
  it("hides on auth/standalone routes", () => {
    for (const p of ["/login", "/install", "/ios-spike", "/photo-test", "/checklists/abc"]) {
      expect(shouldHideShell(p)).toBe(true);
    }
  });

  it("shows on app routes", () => {
    for (const p of ["/", "/review", "/issues", "/rules", "/admin/users"]) {
      expect(shouldHideShell(p)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/nav.test.ts`
Expected: FAIL — `Cannot find module './nav'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/nav.ts
import { Role } from "@prisma/client";

// Single source of truth for app navigation (replaces BottomNav.managerTabs and
// the admin layout header). Pure + dependency-free so it unit-tests cleanly and
// can be imported from both server and client components.

export type NavItem = { href: string; label: string; group: "main" | "admin" };

const MAIN_MANAGER: NavItem[] = [
  { href: "/", label: "Today", group: "main" },
  { href: "/review", label: "Review", group: "main" },
  { href: "/issues", label: "Issues", group: "main" },
  { href: "/rules", label: "Rules", group: "main" },
];

const ADMIN_GROUP: NavItem[] = [
  { href: "/admin/users", label: "Users", group: "admin" },
  { href: "/admin/templates", label: "Templates", group: "admin" },
  { href: "/admin/sla", label: "SLA", group: "admin" },
  { href: "/admin/properties", label: "Properties", group: "admin" },
];

/** Nav items for a role. Field staff have a single Today surface. */
export function navItemsForRole(role: Role): NavItem[] {
  if (role === Role.ADMIN) return [...MAIN_MANAGER, ...ADMIN_GROUP];
  if (role === Role.MANAGER || role === Role.CORPORATE) return MAIN_MANAGER;
  return [{ href: "/", label: "Today", group: "main" }];
}

/** Today (/) matches only the exact root; everything else matches by prefix. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

// Routes that render bare (no shell chrome): auth, standalone POCs, and the
// phone-first checklist fill runtime (reparented in a later plan).
export const SHELL_HIDE_PREFIXES = [
  "/login",
  "/install",
  "/ios-spike",
  "/photo-test",
  "/checklists",
];

export function shouldHideShell(pathname: string): boolean {
  return SHELL_HIDE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/nav.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts
git commit -m "feat(nav): pure role-aware nav model + shell-hide logic (ADR-018)"
```

---

### Task 2: Property-scope helper — pure (`lib/property-scope.ts`)

The "global filter": when a multi-property user has an active property selected, property-scoped queries narrow to that one; otherwise they span all accessible properties.

**Files:**
- Create: `lib/property-scope.ts`
- Test: `lib/property-scope.test.ts`

**Interfaces:**
- Produces: `resolveScopedPropertyIds(accessibleIds: string[], activeId: string | null): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/property-scope.test.ts
import { describe, expect, it } from "vitest";
import { resolveScopedPropertyIds } from "./property-scope";

describe("resolveScopedPropertyIds", () => {
  it("narrows to the active property when it is accessible", () => {
    expect(resolveScopedPropertyIds(["a", "b", "c"], "b")).toEqual(["b"]);
  });

  it("ignores an active id the user cannot access (returns all accessible)", () => {
    expect(resolveScopedPropertyIds(["a", "b"], "z")).toEqual(["a", "b"]);
  });

  it("returns all accessible when no active property is set", () => {
    expect(resolveScopedPropertyIds(["a", "b"], null)).toEqual(["a", "b"]);
  });

  it("handles the empty accessible set", () => {
    expect(resolveScopedPropertyIds([], "a")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/property-scope.test.ts`
Expected: FAIL — `Cannot find module './property-scope'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/property-scope.ts

// Resolves which property ids a scoped list query should cover. The active
// property (from the header picker cookie) narrows the view; an absent or
// inaccessible selection falls back to the user's full accessible set.
// Pairs with rbac.accessiblePropertyIds + current-property.getCurrentPropertyId.
export function resolveScopedPropertyIds(
  accessibleIds: string[],
  activeId: string | null,
): string[] {
  if (activeId && accessibleIds.includes(activeId)) return [activeId];
  return accessibleIds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/property-scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/property-scope.ts lib/property-scope.test.ts
git commit -m "feat(scope): pure active-property resolver for the global filter"
```

---

### Task 3: Shell components (`components/shell/*`)

The visual shell. `AppShell` (server) decides whether a user is logged in and gathers nav data; `ShellChrome` (client) renders the responsive chrome and content area; `PageHeader` is a reusable title/actions slot for pages.

**Files:**
- Create: `components/shell/AppShell.tsx`
- Create: `components/shell/ShellChrome.tsx`
- Create: `components/shell/PageHeader.tsx`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; `accessibleProperties`, `isPortfolioRole`, `type PickerProperty` from `@/lib/rbac`; `getCurrentPropertyId` from `@/lib/current-property`; `navItemsForRole`, `isNavItemActive`, `shouldHideShell`, `type NavItem` from `@/lib/nav`; existing `PropertyPicker`, `OnlineStatus`, `SignOutButton`.
- Produces:
  - `AppShell` (default-export-free named server component): `function AppShell({ children }: { children: React.ReactNode }): Promise<JSX.Element>`
  - `ShellChrome` (client): props `{ name: string; role: Role; navItems: NavItem[]; properties: PickerProperty[]; currentPropertyId: string | null; showPicker: boolean; children: React.ReactNode }`
  - `PageHeader`: props `{ title: string; subtitle?: string; actions?: React.ReactNode }`

- [ ] **Step 1: Create `PageHeader`**

```tsx
// components/shell/PageHeader.tsx

// Standard page title block used at the top of each page's content. The shell
// supplies surrounding chrome; pages supply this + their body.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold text-navy">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create `ShellChrome` (client)**

```tsx
// components/shell/ShellChrome.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@prisma/client";
import { isNavItemActive, shouldHideShell, type NavItem } from "@/lib/nav";
import type { PickerProperty } from "@/lib/rbac";
import { PropertyPicker } from "@/components/PropertyPicker";
import { OnlineStatus } from "@/components/OnlineStatus";
import { SignOutButton } from "@/components/SignOutButton";

// Responsive app chrome. Desktop (lg+): fixed navy sidebar + content area.
// Mobile (<lg): bottom tab bar + content. Hidden entirely on auth/standalone
// routes so /login etc. render bare. Active state is pathname-driven.
export function ShellChrome({
  name,
  navItems,
  properties,
  currentPropertyId,
  showPicker,
  children,
}: {
  name: string;
  role: Role;
  navItems: NavItem[];
  properties: PickerProperty[];
  currentPropertyId: string | null;
  showPicker: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (shouldHideShell(pathname)) return <>{children}</>;

  const mainItems = navItems.filter((i) => i.group === "main");
  const adminItems = navItems.filter((i) => i.group === "admin");

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-navy px-4 py-6 text-white lg:flex lg:fixed lg:inset-y-0">
        <div className="px-2 text-lg font-extrabold tracking-tight">Stayable</div>
        <p className="mt-1 px-2 text-xs text-slate-300">Operations</p>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {mainItems.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
          {adminItems.length > 0 && (
            <>
              <p className="mt-6 px-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                Admin
              </p>
              {adminItems.map((item) => (
                <SidebarLink key={item.href} item={item} pathname={pathname} />
              ))}
            </>
          )}
        </nav>

        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 px-2 pt-4">
          <span className="truncate text-sm font-semibold">{name}</span>
          {showPicker && (
            <PropertyPicker properties={properties} current={currentPropertyId} />
          )}
          <div className="flex items-center justify-between">
            <OnlineStatus />
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-h-screen w-full flex-col lg:pl-60">
        {/* Mobile top bar (picker + sign out live here on small screens) */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:hidden">
          <span className="text-base font-extrabold text-navy">Stayable</span>
          <div className="flex items-center gap-2">
            <OnlineStatus />
            {showPicker && (
              <PropertyPicker properties={properties} current={currentPropertyId} />
            )}
            <SignOutButton />
          </div>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-10">
          {children}
        </main>

        {/* Mobile bottom tab bar — main items only */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-md items-stretch justify-around">
            {mainItems.map((item) => {
              const active = isNavItemActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-semibold ${
                    active ? "text-navy" : "text-slate-400"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavItemActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {item.label}
    </Link>
  );
}
```

- [ ] **Step 3: Create `AppShell` (server)**

```tsx
// components/shell/AppShell.tsx
import { auth } from "@/lib/auth";
import {
  accessibleProperties,
  isPortfolioRole,
} from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { navItemsForRole } from "@/lib/nav";
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

  return (
    <ShellChrome
      name={session.user.name ?? ""}
      role={role}
      navItems={navItemsForRole(role)}
      properties={properties}
      currentPropertyId={currentPropertyId}
      showPicker={showPicker}
    >
      {children}
    </ShellChrome>
  );
}
```

- [ ] **Step 4: Verify types + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (Components aren't rendered yet — mounted in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add components/shell/
git commit -m "feat(shell): AppShell + ShellChrome + PageHeader components (ADR-018)"
```

---

### Task 4: Mount the shell in the root layout

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `AppShell` from `@/components/shell/AppShell`.

- [ ] **Step 1: Replace the `AppNav` mount with `AppShell` wrapping children**

In `app/layout.tsx`, change the import:

```tsx
// remove:
import { AppNav } from "@/components/AppNav";
// add:
import { AppShell } from "@/components/shell/AppShell";
```

And change the body so children render inside the shell (replace the `{children}` + `<AppNav />` block):

```tsx
<body className="font-sans antialiased">
  <NextIntlClientProvider locale={locale} messages={messages}>
    <AppShell>{children}</AppShell>
  </NextIntlClientProvider>
  <ServiceWorkerRegister />
</body>
```

- [ ] **Step 2: Build to verify the shell renders app-wide**

Run: `pnpm build`
Expected: build succeeds; route count unchanged from before this plan.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(shell): mount AppShell in root layout, retire AppNav"
```

---

### Task 5: Migrate Home into the shell (`app/page.tsx`)

Strip the inline navy header band, the in-page `OnlineStatus`/`PropertyPicker`/`SignOutButton` (now in the shell), and the `max-w-md`/`min-h-screen`/`pb-24` wrapper. Keep the progress card, the assignments feed, `LocalePrompt`, and `InstallPrompt`. The greeting moves into a `PageHeader`.

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `PageHeader` from `@/components/shell/PageHeader`.

- [ ] **Step 1: Trim imports**

Remove these now-unused imports from `app/page.tsx`:

```tsx
import { SignOutButton } from "@/components/SignOutButton";
import { OnlineStatus } from "@/components/OnlineStatus";
import { PropertyPicker } from "@/components/PropertyPicker";
import { accessibleProperties, isPortfolioRole } from ...  // drop these two names
import { getCurrentPropertyId } from "@/lib/current-property";
```

Add:

```tsx
import { PageHeader } from "@/components/shell/PageHeader";
```

Keep `isAdmin` and `requireUser` from `@/lib/rbac`. Delete the `properties` / `showPicker` / `currentPropertyId` block (lines that called `accessibleProperties`, `isPortfolioRole`, `getCurrentPropertyId`) — the shell owns the picker now.

- [ ] **Step 2: Replace the outer wrapper + header**

Replace the opening `return (` markup down through the closing `</header>` and the progress card's outer `-mt-6` wrapper with shell-friendly markup. The new top of the returned JSX:

```tsx
return (
  <>
    <PageHeader
      title={t("greeting", { name: user.name })}
      subtitle={formatDateInET(today)}
    />

    <LocalePrompt role={user.role} />

    {/* Progress summary card */}
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold uppercase tracking-wide text-slate-500">
          {t("today")}
        </span>
        <span className="text-sm font-semibold text-slate-900">
          {doneCount}/{total}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
```

Then keep the existing admin link block, the `<section>` assignments feed, and the `InstallPrompt` block exactly as they are — but remove their `px-5`/`pt-*` horizontal-padding wrappers (the shell `<main>` supplies padding). Change the admin link wrapper `className="px-5 pt-4"` → `className="pt-4"`, the section `className="px-5 pt-5"` → `className="pt-5"`, and the install wrapper `className="px-5 pt-5"` → `className="pt-5"`. Close with `</>` instead of `</div>`.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: success. Home now renders inside the shell with no duplicate header/picker.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(shell): migrate Today/home into the shell, drop inline header"
```

---

### Task 6: Migrate the admin layout into the shell (`app/admin/layout.tsx`)

The admin pages currently render their own top header + `max-w-5xl` main. The shell now provides chrome and the admin sidebar group, so the layout collapses to a thin pass-through.

**Files:**
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Replace the custom header/main with a pass-through**

Replace the entire returned JSX of `AdminLayout` with:

```tsx
return <>{children}</>;
```

Remove the now-unused header markup, the `max-w-5xl` wrappers, and any imports they used (e.g. nav `Link`s, `SignOutButton`) that are no longer referenced. Keep any server-side guard the layout performs (e.g. a `requireAdmin()` call) if present.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: success; admin pages render inside the shell with the Admin sidebar group active.

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat(shell): fold admin pages into the shell, remove bespoke admin header"
```

---

### Task 7: Migrate review / issues / rules + apply the global property filter

These three pages each wrap content in their own `<main className="mx-auto ... max-w-* ... pb-24">`. Reduce each to content-only (the shell `<main>` supplies the container) and apply the active-property filter to the two list queries.

**Files:**
- Modify: `app/review/page.tsx`
- Modify: `app/issues/page.tsx`
- Modify: `app/rules/page.tsx`
- Modify: `app/review/[id]/page.tsx`
- Modify: `app/issues/[id]/page.tsx`

**Interfaces:**
- Consumes: `resolveScopedPropertyIds` from `@/lib/property-scope`; `getCurrentPropertyId` from `@/lib/current-property`; existing `accessiblePropertyIds` from `@/lib/rbac`.

- [ ] **Step 1: Strip the page-level `<main>` wrappers**

In each of the five files, replace the outer `<main className="mx-auto flex min-h-screen max-w-... gap-... p-... pb-24 ...">` opening tag with a fragment-friendly wrapper that keeps the vertical rhythm but drops the screen/width/padding the shell now owns:

```tsx
<div className="flex flex-col gap-6">
  {/* ...existing inner content unchanged... */}
</div>
```

Update the matching closing `</main>` to `</div>`. Do not change the inner content. (For `app/rules/page.tsx`, whose wrapper is `mx-auto max-w-3xl px-4 py-6 pb-24`, do the same — replace with `<div className="flex flex-col gap-6">`.)

- [ ] **Step 2: Apply the active-property filter to the review queue**

In `app/review/page.tsx`, find where it computes the property ids it queries by (it uses `accessiblePropertyIds`). Add the active-property narrowing. Near the top, after the user + accessible ids are resolved:

```tsx
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";

// ...inside the component, where `propertyIds` (from accessiblePropertyIds) exists:
const activeId = await getCurrentPropertyId(propertyIds);
const scopedIds = resolveScopedPropertyIds(propertyIds, activeId);
```

Then use `scopedIds` in the `where: { propertyId: { in: ... } }` clause of the instance query instead of the full accessible set.

- [ ] **Step 3: Apply the same filter to the issues list**

In `app/issues/page.tsx`, perform the identical change: resolve `activeId` via `getCurrentPropertyId(propertyIds)`, compute `scopedIds = resolveScopedPropertyIds(propertyIds, activeId)`, and use `scopedIds` in the issues `where` property filter.

- [ ] **Step 4: Typecheck, lint, full test, build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: types clean, lint clean, all tests pass (including the new `lib/nav.test.ts` and `lib/property-scope.test.ts`), build succeeds with the same route count.

- [ ] **Step 5: Commit**

```bash
git add app/review app/issues app/rules
git commit -m "feat(shell): content-only pages + active-property global filter on review/issues"
```

---

### Task 8: Clean up the retired nav + ship to Preview

**Files:**
- Delete: `components/AppNav.tsx`
- Delete: `components/BottomNav.tsx`

- [ ] **Step 1: Confirm nothing else imports the retired components**

Run: `git grep -n "components/AppNav\|components/BottomNav\|from \"./BottomNav\""`
Expected: no results (Task 4 removed the only `AppNav` use; `BottomNav` was only used by `AppNav`). If anything remains, update it to the shell before deleting.

- [ ] **Step 2: Delete the retired files**

```bash
git rm components/AppNav.tsx components/BottomNav.tsx
```

- [ ] **Step 3: Final verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; route count unchanged.

- [ ] **Step 4: Commit + push branch for Preview**

```bash
git add -A
git commit -m "chore(shell): remove retired AppNav/BottomNav after shell migration"
git push origin claude/rise8-operations-platform-rv9B6
```

Then report the Vercel **Preview** URL for Kate to review: desktop (sidebar) + mobile (bottom bar) on `/`, `/review`, `/issues`, `/rules`, `/admin/users`. Do NOT merge to `main` until Kate approves the look.

---

## Self-Review

**Spec coverage (§3 + §3.5):**
- Left-sidebar desktop / bottom-bar mobile → Task 3 (`ShellChrome`). ✓
- Route-aware hide → Task 1 (`shouldHideShell`) + Task 3. ✓
- Single role-aware nav replacing both old systems → Tasks 1, 4, 6, 8. ✓
- Standardized width → Task 3 `<main max-w-6xl>` + Tasks 5–7 stripping per-page widths. ✓
- Property scope as global header filter → picker in shell (Task 3) + `resolveScopedPropertyIds` applied to review/issues (Tasks 2, 7). ✓
- Visual language preserved (navy, cards, pills) → Task 3 uses `bg-navy`, Task 5 keeps the card/pill markup. ✓
- Fill runtime left standalone → `SHELL_HIDE_PREFIXES` includes `/checklists` (Task 1). ✓

**Deferred to later plans (by design, not gaps):** nav entries for `/completed` (Plan 4), `/dashboard` (Plan 5), `/templates` (Plan 3); reparenting the fill runtime into a wide desktop layout (later plan).

**Placeholder scan:** none — every code step has complete content; migration steps name exact classNames/strings to change.

**Type consistency:** `NavItem`, `navItemsForRole`, `isNavItemActive`, `shouldHideShell`, `resolveScopedPropertyIds`, and `PickerProperty` are used with the same signatures across Tasks 1–7. `ShellChrome` prop names match `AppShell`'s call site (Task 3).
