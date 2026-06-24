# Plan 5 — Manager Dashboard + Reports + PDF Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give managers a `/dashboard` of actionable alerts (incomplete, with-issues, unassigned, completion %), two ET-anchored property-scoped reports (daily completeness + issues-found), and on-demand PDF export of a completed checklist and of each report.

**Architecture:** Dashboard + reports are server components reusing the established property-scope trio and modeled on the `/review` and `/issues` queries. A pure aggregation helper turns Prisma `groupBy` rows into completeness rows (unit-tested). PDF is generated server-side with `@react-pdf/renderer` via Node-runtime Route Handlers returning `application/pdf`; the library is de-risked in Task 1 before any real document is built (it is not yet installed and must work under Next 15 + Turbopack + React 19).

**Tech Stack:** Next.js 15 App Router (Route Handlers, Node runtime), TypeScript strict, Prisma/Neon (`groupBy`), `@react-pdf/renderer` (new), Vitest, shadcn/Tailwind, `lib/datetime.ts`, `lib/r2.ts` presign.

## Global Constraints

- TypeScript strict; no `any` without a documented reason.
- Property scope on every list/report: `accessiblePropertyIds(user)` → `getCurrentPropertyId(accessibleIds)` → `resolveScopedPropertyIds(accessibleIds, activeId)` → query filters `propertyId: { in: scopeIds }`.
- All datetimes display in `America/New_York` via `lib/datetime.ts`: `formatInET(v, pattern?)` (trailing ` ET`), `formatDateInET(v, pattern?)` (no suffix), `etDateOnly(v)`, `etYYYYMMDD(v)`. Never call `toLocaleString`/`Intl` directly.
- Completeness semantics (match the rest of the app): **done = `SUBMITTED || REVIEWED`**; **incomplete = `SCHEDULED || ASSIGNED || IN_PROGRESS || FLAGGED`**; `INVALIDATED`/`EXPIRED` are terminal/excluded from "scheduled" denominators unless stated.
- Date params (`from`/`to`, `yyyy-MM-dd`) must map to UTC-midnight Dates for comparison against `scheduledFor` (`@db.Date`) — use the same direct `new Date(\`${s}T00:00:00.000Z\`)` parse that `/completed` uses (NOT `etDateOnly(string)`, which shifts the day; this was confirmed in Plan 4 Task 5).
- Pages render inside the AppShell (content only) using `PageHeader`.
- Auth: dashboard + reports + PDF routes are MANAGER+ (`requireManager` for pages; the PDF route handlers re-check auth + property access).
- PDF routes: `export const runtime = "nodejs"` (react-pdf needs Node, not edge); return `new NextResponse(buffer, { headers: { "content-type": "application/pdf", "content-disposition": ... } })`.
- PDF filename convention (project): `Title_PropertyID_MMDDYY.pdf` style where practical (e.g. `Arrival_4645_062526.pdf`); reports use the entity/matter name (e.g. `Completeness_RISE8_062526.pdf`).
- SLA breach reuses `isSlaBreached(slaTarget, resolvedAt, now)` and `slaHoursByPriority()` — do not reimplement.
- Prisma singleton `import { db } from "@/lib/db"`.

## Decisions resolved for this plan

1. **PDF lib = `@react-pdf/renderer`** (the stack-decided lib). It is NOT installed and React-19/Turbopack compatibility is unverified — **Task 1 is a hard de-risk gate**: install, add `serverExternalPackages`, render a trivial doc to a buffer through a Node-runtime route, and confirm the production build succeeds. If it cannot be made to work, Task 1 reports BLOCKED with findings and the controller chooses a fallback before any further PDF task runs.
2. **Default fonts only** (react-pdf built-in Helvetica) — no custom font embedding in v1 (avoids font-loading failure modes). Brand fonts are a Phase 7 concern.
3. **PDF images:** react-pdf `<Image src={presignedUrl} />` fetches the presigned R2 GET URL at render time (Node runtime can fetch). Presign each photo (1h TTL) just before rendering.
4. **Reports are two pages** under `/reports/*` with a shared sub-nav; one top-level **Reports** nav item points at `/reports/completeness`. Dashboard is its own **Dashboard** nav item.
5. **"With issues"** for an instance = it has ≥1 `sourcedIssues` row that is OPEN/ASSIGNED/IN_PROGRESS (an open issue). Computed via the existing `Issue.sourceInstanceId` relation (`sourcedIssues`).
6. **Overdue** = not-done AND `dueAt != null AND dueAt < now` (fall back to `scheduledFor < today ET` when `dueAt` is null). EXPIRED status also counts as overdue-terminal but is shown separately/excluded from active alerts.

---

## File Structure

**Create:**
- `lib/reports.ts` — pure `summarizeCompleteness(...)` + types.
- `lib/reports.test.ts` — Vitest.
- `lib/pdf/render.ts` — `renderPdfToBuffer(doc)` thin wrapper over react-pdf `renderToBuffer`.
- `lib/pdf/ChecklistPdf.tsx` — react-pdf Document for one completed checklist.
- `lib/pdf/CompletenessPdf.tsx` — react-pdf Document for the completeness report.
- `lib/pdf/IssuesPdf.tsx` — react-pdf Document for the issues-found report.
- `lib/pdf/pdf-styles.ts` — shared `StyleSheet` for the documents.
- `app/api/checklists/[id]/pdf/route.ts` — single-checklist PDF download.
- `app/api/reports/completeness/pdf/route.ts` — completeness report PDF.
- `app/api/reports/issues/pdf/route.ts` — issues report PDF.
- `app/dashboard/page.tsx` — manager dashboard.
- `app/reports/completeness/page.tsx` + `app/reports/issues/page.tsx` — report pages.
- `app/reports/ReportsNav.tsx` — sub-nav between the two reports.
- `app/reports/ReportFilters.tsx` — shared client date/property/status filter controls.

**Modify:**
- `package.json` — add `@react-pdf/renderer`.
- `next.config.ts` — `serverExternalPackages: ["@react-pdf/renderer"]`.
- `app/review/[id]/page.tsx` — add an "Export PDF" link to `/api/checklists/[id]/pdf`.
- `lib/nav.ts` + `lib/nav.test.ts` — add `Dashboard` and `Reports` to `MAIN_MANAGER`.

---

### Task 1: PDF library de-risk gate

**Files:**
- Modify: `package.json`, `next.config.ts`
- Create: `lib/pdf/render.ts`, `app/api/_pdf-smoke/route.ts` (temporary smoke route — removed at the end of this task)

**Interfaces:**
- Produces: `renderPdfToBuffer(element: React.ReactElement): Promise<Buffer>`; a verified-working react-pdf setup.

- [ ] **Step 1: Install the library**

Run:

```bash
pnpm add @react-pdf/renderer
```

If install fails on a React 19 peer-dep conflict, retry with `pnpm add @react-pdf/renderer --config.strict-peer-dependencies=false` (pnpm) and record the installed version in the report. Expected: a 3.x/4.x version added to `package.json`.

- [ ] **Step 2: Mark it a server-external package**

In `next.config.ts`, add (merge into the existing config object):

```typescript
const nextConfig = {
  // ...existing config...
  serverExternalPackages: ["@react-pdf/renderer"],
};
```

(If the config already has `serverExternalPackages`, append to the array.)

- [ ] **Step 3: Write the render wrapper**

```typescript
// lib/pdf/render.ts
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

// Server-only: react-pdf needs the Node runtime. Route handlers that call this
// must declare `export const runtime = "nodejs"`.
export async function renderPdfToBuffer(doc: ReactElement): Promise<Buffer> {
  return renderToBuffer(doc);
}
```

- [ ] **Step 4: Write a temporary smoke route**

```tsx
// app/api/_pdf-smoke/route.ts
import { NextResponse } from "next/server";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { renderPdfToBuffer } from "@/lib/pdf/render";

export const runtime = "nodejs";

export async function GET() {
  const doc = (
    <Document>
      <Page size="A4" style={{ padding: 24 }}>
        <View>
          <Text>Stayable Operations — PDF smoke test OK</Text>
        </View>
      </Page>
    </Document>
  );
  const buffer = await renderPdfToBuffer(doc);
  return new NextResponse(buffer, {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": "inline; filename=smoke.pdf" },
  });
}
```

- [ ] **Step 5: Prove it builds and renders**

Run:

```bash
pnpm tsc --noEmit && pnpm build
```

Expected: build succeeds with `/api/_pdf-smoke` listed and NO Turbopack/bundling error mentioning `@react-pdf/renderer`. If the build fails specifically due to react-pdf bundling/runtime under Turbopack or a React 19 incompatibility that `serverExternalPackages` does not resolve, STOP and report **BLOCKED** with the exact error and the installed version — do not hack around it; the controller will choose a fallback (pin a version / alternate lib) before later PDF tasks.

> If a runtime smoke is feasible in the environment (dev server + curl the route), capturing that the route returns a non-empty `application/pdf` body strengthens the gate; a clean production build is the minimum bar.

- [ ] **Step 6: Remove the smoke route, keep the wrapper**

Delete `app/api/_pdf-smoke/route.ts` (it was only to prove the toolchain). Keep `lib/pdf/render.ts`, the dependency, and the config change.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts lib/pdf/render.ts
git commit -m "build(pdf): add @react-pdf/renderer (server-external) + verified render wrapper"
```

---

### Task 2: Pure completeness aggregation

**Files:**
- Create: `lib/reports.ts`, `lib/reports.test.ts`

**Interfaces:**
- Produces:
  - `type CompletenessRow = { propertyId: string; date: string; scheduled: number; completed: number; incomplete: number; withIssues: number; pct: number }`
  - `type StatusCount = { propertyId: string; scheduledFor: Date; status: InstanceStatus; count: number }`
  - `summarizeCompleteness(counts: StatusCount[], withIssuesByKey: Record<string, number>, ymd: (d: Date) => string): CompletenessRow[]`
  Task 4/7 consume it. `withIssuesByKey` is keyed `"${propertyId}|${ymd(scheduledFor)}"`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/reports.test.ts
import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@prisma/client";
import { summarizeCompleteness, type StatusCount } from "./reports";

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, ""); // test stub

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("summarizeCompleteness", () => {
  it("computes scheduled/completed/incomplete/pct per property+day", () => {
    const counts: StatusCount[] = [
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.SUBMITTED, count: 3 },
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.REVIEWED, count: 1 },
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.ASSIGNED, count: 2 },
    ];
    const [row] = summarizeCompleteness(counts, {}, ymd);
    expect(row.propertyId).toBe("P1");
    expect(row.scheduled).toBe(6);
    expect(row.completed).toBe(4); // SUBMITTED + REVIEWED
    expect(row.incomplete).toBe(2);
    expect(row.pct).toBe(67); // round(4/6*100)
    expect(row.withIssues).toBe(0);
  });

  it("excludes INVALIDATED/EXPIRED from the scheduled denominator", () => {
    const counts: StatusCount[] = [
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.REVIEWED, count: 2 },
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.INVALIDATED, count: 5 },
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.EXPIRED, count: 1 },
    ];
    const [row] = summarizeCompleteness(counts, {}, ymd);
    expect(row.scheduled).toBe(2);
    expect(row.completed).toBe(2);
    expect(row.pct).toBe(100);
  });

  it("maps withIssues by property|day key", () => {
    const counts: StatusCount[] = [
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.SUBMITTED, count: 4 },
    ];
    const [row] = summarizeCompleteness(counts, { "P1|20260624": 2 }, ymd);
    expect(row.withIssues).toBe(2);
  });

  it("pct is 0 when nothing scheduled (no divide-by-zero)", () => {
    const counts: StatusCount[] = [
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.INVALIDATED, count: 3 },
    ];
    const [row] = summarizeCompleteness(counts, {}, ymd);
    expect(row.scheduled).toBe(0);
    expect(row.pct).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/reports.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// lib/reports.ts
import { InstanceStatus } from "@prisma/client";

export type StatusCount = {
  propertyId: string;
  scheduledFor: Date;
  status: InstanceStatus;
  count: number;
};

export type CompletenessRow = {
  propertyId: string;
  date: string; // ymd key
  scheduled: number;
  completed: number;
  incomplete: number;
  withIssues: number;
  pct: number;
};

const DONE = new Set<InstanceStatus>([InstanceStatus.SUBMITTED, InstanceStatus.REVIEWED]);
const INCOMPLETE = new Set<InstanceStatus>([
  InstanceStatus.SCHEDULED,
  InstanceStatus.ASSIGNED,
  InstanceStatus.IN_PROGRESS,
  InstanceStatus.FLAGGED,
]);
// INVALIDATED / EXPIRED are terminal and excluded from the scheduled denominator.

export function summarizeCompleteness(
  counts: StatusCount[],
  withIssuesByKey: Record<string, number>,
  ymd: (d: Date) => string,
): CompletenessRow[] {
  const byKey = new Map<string, CompletenessRow>();
  for (const c of counts) {
    const date = ymd(c.scheduledFor);
    const key = `${c.propertyId}|${date}`;
    let row = byKey.get(key);
    if (!row) {
      row = { propertyId: c.propertyId, date, scheduled: 0, completed: 0, incomplete: 0, withIssues: withIssuesByKey[key] ?? 0, pct: 0 };
      byKey.set(key, row);
    }
    if (DONE.has(c.status)) {
      row.completed += c.count;
      row.scheduled += c.count;
    } else if (INCOMPLETE.has(c.status)) {
      row.incomplete += c.count;
      row.scheduled += c.count;
    }
  }
  for (const row of byKey.values()) {
    row.pct = row.scheduled === 0 ? 0 : Math.round((row.completed / row.scheduled) * 100);
  }
  return [...byKey.values()].sort((a, b) => (a.date === b.date ? a.propertyId.localeCompare(b.propertyId) : b.date.localeCompare(a.date)));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/reports.test.ts` — Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add lib/reports.ts lib/reports.test.ts
git commit -m "feat(reports): pure completeness aggregation helper"
```

---

### Task 3: Manager dashboard `/dashboard`

**Files:**
- Create: `app/dashboard/page.tsx`
- Modify: `lib/nav.ts`, `lib/nav.test.ts`

**Interfaces:**
- Consumes: scope trio, `db`, `etDateOnly`, `isSlaBreached`/`slaHoursByPriority` not needed here; uses instance + issue counts.
- Produces: `/dashboard` route; `Dashboard` nav item.

- [ ] **Step 1: Build the dashboard page**

```tsx
// app/dashboard/page.tsx
import Link from "next/link";
import { InstanceStatus, IssueStatus } from "@prisma/client";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etDateOnly } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";

const DONE = [InstanceStatus.SUBMITTED, InstanceStatus.REVIEWED];
const INCOMPLETE = [InstanceStatus.SCHEDULED, InstanceStatus.ASSIGNED, InstanceStatus.IN_PROGRESS, InstanceStatus.FLAGGED];
const OPEN_ISSUE = [IssueStatus.OPEN, IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS];

function Alert({ href, label, value, tone }: { href: string; label: string; value: number | string; tone: string }) {
  return (
    <Link href={href} className={`flex flex-col gap-1 rounded-lg p-4 ring-1 shadow-sm ${tone}`}>
      <span className="text-3xl font-bold">{value}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);
  const today = etDateOnly();
  const now = new Date();

  const [todayTotal, todayDone, overdue, unassigned, openIssues] = await Promise.all([
    db.checklistInstance.count({ where: { propertyId: { in: scopeIds }, scheduledFor: today, status: { in: [...DONE, ...INCOMPLETE] } } }),
    db.checklistInstance.count({ where: { propertyId: { in: scopeIds }, scheduledFor: today, status: { in: DONE } } }),
    db.checklistInstance.count({ where: { propertyId: { in: scopeIds }, status: { in: INCOMPLETE }, dueAt: { lt: now } } }),
    db.checklistInstance.count({ where: { propertyId: { in: scopeIds }, status: { in: INCOMPLETE }, assignedUserId: null } }),
    db.issue.count({ where: { propertyId: { in: scopeIds }, status: { in: OPEN_ISSUE } } }),
  ]);
  const pct = todayTotal === 0 ? 0 : Math.round((todayDone / todayTotal) * 100);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" subtitle="Today's status and open work for your properties" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Alert href="/completed" label={`Complete today (${todayDone}/${todayTotal})`} value={`${pct}%`} tone="bg-emerald-50 text-emerald-800 ring-emerald-200" />
        <Alert href="/review" label="Incomplete today" value={todayTotal - todayDone} tone="bg-amber-50 text-amber-800 ring-amber-200" />
        <Alert href="/review" label="Overdue" value={overdue} tone="bg-red-50 text-red-800 ring-red-200" />
        <Alert href="/review" label="Unassigned" value={unassigned} tone="bg-slate-50 text-slate-700 ring-slate-200" />
        <Alert href="/issues" label="Open issues" value={openIssues} tone="bg-blue-50 text-blue-800 ring-blue-200" />
      </div>
      <p className="text-xs text-slate-400">Counts respect the active property filter. ET-anchored.</p>
    </div>
  );
}
```

- [ ] **Step 2: Add the nav test (TDD) + run RED**

Add to `lib/nav.test.ts`:

```typescript
it("MANAGER sees Dashboard", () => {
  expect(navItemsForRole(Role.MANAGER).some((n) => n.href === "/dashboard")).toBe(true);
});
```

Run: `pnpm vitest run lib/nav.test.ts` — Expected: FAIL.

- [ ] **Step 3: Add Dashboard to nav**

In `lib/nav.ts`, add to `MAIN_MANAGER` as the FIRST item after Today (so order is Today, Dashboard, Review, ...):

```typescript
  { href: "/dashboard", label: "Dashboard", group: "main" },
```

If an exact-ordered-array nav test exists, update its expected array to include `/dashboard` in the new position.

- [ ] **Step 4: Run to verify it passes + types/build**

Run: `pnpm vitest run lib/nav.test.ts && pnpm tsc --noEmit && pnpm build`
Expected: pass; `/dashboard` route built.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard lib/nav.ts lib/nav.test.ts
git commit -m "feat(dashboard): manager alert dashboard (incomplete/overdue/unassigned/issues)"
```

---

### Task 4: Completeness report page

**Files:**
- Create: `app/reports/completeness/page.tsx`, `app/reports/ReportsNav.tsx`, `app/reports/ReportFilters.tsx`
- Modify: `lib/nav.ts`, `lib/nav.test.ts`

**Interfaces:**
- Consumes: `summarizeCompleteness` (Task 2), scope trio, `accessibleProperties` (for short-code labels), `formatDateInET`/`etYYYYMMDD`.
- Produces: `/reports/completeness`; `Reports` nav item; `ReportsNav`, `ReportFilters` for reuse by Task 5.

- [ ] **Step 1: Build `ReportsNav` (sub-nav)**

```tsx
// app/reports/ReportsNav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/reports/completeness", label: "Daily completeness" },
  { href: "/reports/issues", label: "Issues found" },
];

export function ReportsNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href}
            className={`px-3 py-2 text-sm font-medium ${active ? "border-b-2 border-navy text-navy" : "text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build `ReportFilters` (shared from/to + optional extra slot)**

```tsx
// app/reports/ReportFilters.tsx
"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function ReportFilters({ children, pdfHref }: { children?: React.ReactNode; pdfHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-slate-600">From
        <input type="date" defaultValue={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <label className="text-sm text-slate-600">To
        <input type="date" defaultValue={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      {children}
      <a href={`${pdfHref}?${params.toString()}`} className="ml-auto rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
        Export PDF
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Build the completeness page**

```tsx
// app/reports/completeness/page.tsx
import { InstanceStatus, IssueStatus } from "@prisma/client";
import { requireManager, accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etYYYYMMDD, formatDateInET } from "@/lib/datetime";
import { summarizeCompleteness, type StatusCount } from "@/lib/reports";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReportsNav } from "../ReportsNav";
import { ReportFilters } from "../ReportFilters";

const parseDateParam = (s?: string) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const OPEN_ISSUE = [IssueStatus.OPEN, IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS];

export default async function CompletenessReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);
  const properties = await accessibleProperties(user);
  const codeById = new Map(properties.map((p) => [p.id, p.shortCode]));

  const from = parseDateParam(sp.from);
  const to = parseDateParam(sp.to);
  const dateWhere = from || to ? { scheduledFor: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  const grouped = await db.checklistInstance.groupBy({
    by: ["propertyId", "scheduledFor", "status"],
    where: { propertyId: { in: scopeIds }, ...dateWhere },
    _count: { _all: true },
  });
  const counts: StatusCount[] = grouped.map((g) => ({
    propertyId: g.propertyId, scheduledFor: g.scheduledFor, status: g.status, count: g._count._all,
  }));

  // With-issues per (property, day): instances that have an open sourced issue.
  const issueInstances = await db.checklistInstance.findMany({
    where: { propertyId: { in: scopeIds }, ...dateWhere, sourcedIssues: { some: { status: { in: OPEN_ISSUE } } } },
    select: { propertyId: true, scheduledFor: true },
  });
  const withIssuesByKey: Record<string, number> = {};
  for (const i of issueInstances) {
    const key = `${i.propertyId}|${etYYYYMMDD(i.scheduledFor)}`;
    withIssuesByKey[key] = (withIssuesByKey[key] ?? 0) + 1;
  }

  const rows = summarizeCompleteness(counts, withIssuesByKey, etYYYYMMDD);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" subtitle="Daily completeness across your properties" />
      <ReportsNav />
      <ReportFilters pdfHref="/api/reports/completeness/pdf" />
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Property</th><th className="px-4 py-2">Scheduled</th><th className="px-4 py-2">Complete</th><th className="px-4 py-2">Incomplete</th><th className="px-4 py-2">With issues</th><th className="px-4 py-2">%</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.propertyId}|${r.date}`} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-500">{formatDateInET(new Date(`${r.date.slice(0,4)}-${r.date.slice(4,6)}-${r.date.slice(6,8)}T00:00:00.000Z`))}</td>
                <td className="px-4 py-2 font-medium">{codeById.get(r.propertyId) ?? r.propertyId}</td>
                <td className="px-4 py-2">{r.scheduled}</td>
                <td className="px-4 py-2 text-emerald-700">{r.completed}</td>
                <td className="px-4 py-2 text-amber-700">{r.incomplete}</td>
                <td className="px-4 py-2 text-red-700">{r.withIssues}</td>
                <td className="px-4 py-2 font-semibold">{r.pct}%</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No checklists in this scope/range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add `Reports` to nav (with TDD test) + run**

Add to `lib/nav.test.ts`: `it("MANAGER sees Reports", () => { expect(navItemsForRole(Role.MANAGER).some((n) => n.href === "/reports/completeness")).toBe(true); });`
Add to `lib/nav.ts` `MAIN_MANAGER` (after Completed): `{ href: "/reports/completeness", label: "Reports", group: "main" }`. Update the exact-array nav test's expected list.
Run: `pnpm vitest run lib/nav.test.ts && pnpm tsc --noEmit && pnpm build` — Expected: pass; `/reports/completeness` built.

> Note for `isNavItemActive`: it matches `/reports/completeness` by exact/segment; the Reports tab highlight is handled by `ReportsNav` via `usePathname`. The top nav "Reports" item stays active on both report sub-pages because `isNavItemActive` treats `/reports/completeness/...` — but `/reports/issues` will NOT light the top item. Acceptable for v1 (the sub-nav shows context); do not over-engineer.

- [ ] **Step 5: Commit**

```bash
git add app/reports lib/nav.ts lib/nav.test.ts
git commit -m "feat(reports): daily completeness report + reports sub-nav + nav item"
```

---

### Task 5: Issues-found report page

**Files:**
- Create: `app/reports/issues/page.tsx`

**Interfaces:**
- Consumes: `ReportsNav`, `ReportFilters` (Task 4), scope trio, `isSlaBreached`, `accessibleProperties`, `formatDateInET`.
- Produces: `/reports/issues`.

- [ ] **Step 1: Build the issues report page**

```tsx
// app/reports/issues/page.tsx
import { IssueStatus, IssuePriority } from "@prisma/client";
import { requireManager, accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { formatDateInET } from "@/lib/datetime";
import { isSlaBreached } from "@/lib/review";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReportsNav } from "../ReportsNav";
import { ReportFilters } from "../ReportFilters";

const parseDateParam = (s?: string) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

export default async function IssuesReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; priority?: string }> }) {
  const sp = await searchParams;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);
  const properties = await accessibleProperties(user);
  const codeById = new Map(properties.map((p) => [p.id, p.shortCode]));

  const from = parseDateParam(sp.from);
  const to = parseDateParam(sp.to);
  const statusFilter = sp.status && sp.status in IssueStatus ? (sp.status as IssueStatus) : null;
  const priorityFilter = sp.priority && sp.priority in IssuePriority ? (sp.priority as IssuePriority) : null;

  const issues = await db.issue.findMany({
    where: {
      propertyId: { in: scopeIds },
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    select: {
      id: true, title: true, status: true, priority: true, slaTargetAt: true, resolvedAt: true, createdAt: true,
      propertyId: true, room: { select: { roomNumber: true } },
      sourceInstance: { select: { id: true, title: true, template: { select: { name: true } } } },
    },
  });
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" subtitle="Issues found, grouped by checklist" />
      <ReportsNav />
      <ReportFilters pdfHref="/api/reports/issues/pdf">
        <label className="text-sm text-slate-600">Status
          <select defaultValue={sp.status ?? ""} name="status" className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            onChange={undefined}>
            <option value="">All</option>
            {Object.values(IssueStatus).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </ReportFilters>
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Issue</th><th className="px-4 py-2">From checklist</th><th className="px-4 py-2">Property</th><th className="px-4 py-2">Priority</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Created</th><th className="px-4 py-2">SLA</th></tr>
          </thead>
          <tbody>
            {issues.map((i) => {
              const breached = isSlaBreached(i.slaTargetAt, i.resolvedAt, now);
              return (
                <tr key={i.id} className={`border-t border-slate-100 ${breached ? "bg-red-50/40" : ""}`}>
                  <td className="px-4 py-2 font-medium">{i.title}</td>
                  <td className="px-4 py-2 text-slate-500">{i.sourceInstance ? (i.sourceInstance.title ?? i.sourceInstance.template.name) : "—"}</td>
                  <td className="px-4 py-2">{codeById.get(i.propertyId) ?? i.propertyId}</td>
                  <td className="px-4 py-2">{i.priority}</td>
                  <td className="px-4 py-2">{i.status}</td>
                  <td className="px-4 py-2 text-slate-500">{formatDateInET(i.createdAt)}</td>
                  <td className="px-4 py-2">{breached ? <span className="font-semibold text-red-700">Breached</span> : "—"}</td>
                </tr>
              );
            })}
            {issues.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No issues in this scope/range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

> Reconcile against the real `Issue` model: confirm the relation name for the source instance (the map calls it `sourcedIssues` from the instance side; from the Issue side it is likely `sourceInstance` — VERIFY the exact relation field name and `Issue.priority`/`status`/`slaTargetAt`/`resolvedAt`/`createdAt`/`room`/`propertyId` field names, and adjust the select). The `status` filter `<select>` has `onChange={undefined}` as a placeholder — wire it through `ReportFilters`' URL mechanism by lifting the select into `ReportFilters` as a child that calls a passed setter, OR make `ReportFilters` accept extra param keys; if that adds complexity, keep status filtering minimal (URL param honored server-side, control can be a plain link-set) — do not over-build. Resolve in implementation, keeping the server-side `statusFilter`/`priorityFilter` honoring intact.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm build` — Expected: clean; `/reports/issues` built.

- [ ] **Step 3: Commit**

```bash
git add app/reports/issues
git commit -m "feat(reports): issues-found report"
```

---

### Task 6: Single-checklist PDF

**Files:**
- Create: `lib/pdf/pdf-styles.ts`, `lib/pdf/ChecklistPdf.tsx`, `app/api/checklists/[id]/pdf/route.ts`
- Modify: `app/review/[id]/page.tsx` (Export PDF link)

**Interfaces:**
- Consumes: `renderPdfToBuffer` (Task 1), `presignDownload` (`lib/r2.ts`), `formatInET`/`formatDateInET`, `db`, `requireUser`/`canAccessProperty`.
- Produces: `ChecklistPdf({ data })` document; `/api/checklists/[id]/pdf` route.

- [ ] **Step 1: Shared styles**

```tsx
// lib/pdf/pdf-styles.ts
import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  meta: { fontSize: 9, color: "#475569", marginBottom: 12 },
  qBlock: { marginBottom: 10, borderBottom: "1pt solid #e2e8f0", paddingBottom: 8 },
  prompt: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  answer: { color: "#334155" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  photo: { width: 120, height: 120, objectFit: "cover", border: "1pt solid #e2e8f0" },
  photoCap: { fontSize: 7, color: "#64748b", width: 120 },
  tableHead: { flexDirection: "row", backgroundColor: "#f1f5f9", fontFamily: "Helvetica-Bold", fontSize: 8 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #e2e8f0", fontSize: 8 },
  cell: { padding: 4, flex: 1 },
});
```

- [ ] **Step 2: The checklist PDF document**

```tsx
// lib/pdf/ChecklistPdf.tsx
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

export type PdfPhoto = { url: string; capturedAt: string | null; geofence: string; coords: string | null };
export type PdfResponse = { prompt: string; type: string; answerText: string; signatureUrl: string | null; photos: PdfPhoto[] };
export type ChecklistPdfData = {
  title: string;
  propertyLabel: string;
  unit: string | null;
  assignee: string;
  startedAt: string | null;
  completedAt: string | null;
  responses: PdfResponse[];
};

export function ChecklistPdf({ data }: { data: ChecklistPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.h1}>{data.title}</Text>
        <Text style={styles.meta}>
          {data.propertyLabel}{data.unit ? ` · Unit ${data.unit}` : ""} · Assignee: {data.assignee}
          {"\n"}Started: {data.startedAt ?? "—"}   Completed: {data.completedAt ?? "—"}
        </Text>
        {data.responses.map((r, i) => (
          <View key={i} style={styles.qBlock} wrap={false}>
            <Text style={styles.prompt}>{r.prompt}</Text>
            {r.answerText ? <Text style={styles.answer}>{r.answerText}</Text> : null}
            {r.signatureUrl ? <Image style={{ width: 160, height: 60, marginTop: 4 }} src={r.signatureUrl} /> : null}
            {r.photos.length > 0 ? (
              <View style={styles.photoRow}>
                {r.photos.map((p, j) => (
                  <View key={j}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                    <Image style={styles.photo} src={p.url} />
                    <Text style={styles.photoCap}>{[p.geofence, p.capturedAt, p.coords].filter(Boolean).join(" · ")}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: The route handler**

```tsx
// app/api/checklists/[id]/pdf/route.ts
import { NextResponse } from "next/server";
import { GeofenceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canAccessProperty } from "@/lib/rbac";
import { presignDownload } from "@/lib/r2";
import { formatInET } from "@/lib/datetime";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { ChecklistPdf, type PdfResponse } from "@/lib/pdf/ChecklistPdf";
import { answerToText } from "@/lib/pdf/answer-text"; // see Step 3b

export const runtime = "nodejs";

const GEO_LABEL: Record<GeofenceStatus, string> = {
  [GeofenceStatus.VERIFIED]: "On property",
  [GeofenceStatus.OFF_PROPERTY]: "Off property",
  [GeofenceStatus.NO_GPS]: "No GPS",
  [GeofenceStatus.UNVERIFIED]: "No geofence",
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const instance = await db.checklistInstance.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, questions: { orderBy: { orderIndex: "asc" } } } },
      property: { select: { id: true, shortCode: true, name: true, propertyId: true } },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { name: true } },
      responses: { include: { photos: { orderBy: { createdAt: "asc" }, select: { r2Key: true, geofenceStatus: true, capturedAt: true, gpsLat: true, gpsLng: true } } } },
    },
  });
  if (!instance) return NextResponse.json({ error: "not found" }, { status: 404 });
  const user = { id: session.user.id as string, role: session.user.role as never };
  if (!(await canAccessProperty(user, instance.property.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const byQ = new Map(instance.responses.map((r) => [r.questionId, r]));
  const responses: PdfResponse[] = [];
  for (const q of instance.template.questions) {
    const r = byQ.get(q.id);
    const photos = await Promise.all(
      (r?.photos ?? []).map(async (p) => ({
        url: await presignDownload(p.r2Key),
        capturedAt: p.capturedAt ? formatInET(p.capturedAt) : null,
        geofence: GEO_LABEL[p.geofenceStatus],
        coords: p.gpsLat && p.gpsLng ? `${p.gpsLat.toString()}, ${p.gpsLng.toString()}` : null,
      })),
    );
    const isSignature = q.type === "SIGNATURE";
    const sigUrl = isSignature && typeof r?.answer === "string" ? (r.answer as string) : null;
    responses.push({
      prompt: q.prompt,
      type: q.type,
      answerText: isSignature ? "" : answerToText(q.type, r?.answer ?? null),
      signatureUrl: sigUrl,
      photos,
    });
  }

  const data = {
    title: instance.title ?? `${instance.template.name} — ${instance.property.shortCode}`,
    propertyLabel: `${instance.property.shortCode} — ${instance.property.name}`,
    unit: instance.room?.roomNumber ?? null,
    assignee: instance.assignedUser?.name ?? "Unassigned",
    startedAt: instance.openedAt ? formatInET(instance.openedAt) : null,
    completedAt: instance.submittedAt ? formatInET(instance.submittedAt) : null,
    responses,
  };
  const buffer = await renderPdfToBuffer(<ChecklistPdf data={data} />);
  const fname = `${(instance.title ?? instance.template.name).replace(/[^a-z0-9]+/gi, "")}_${instance.property.propertyId}.pdf`;
  return new NextResponse(buffer, {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${fname}"`, "cache-control": "no-store" },
  });
}
```

> Reconcile: confirm `session.user.id`/`session.user.role` exist on the Auth.js session (check `lib/auth.ts` callbacks / `requireUser`'s `SessionUser`); if the route can use `requireUser()` instead of raw `auth()`, prefer it for consistency (but route handlers can't `redirect` the way pages do — `requireUser` redirects, which is wrong for an API; use `auth()` + explicit 401). Confirm signature answers are stored as a data-URL string in `answer` (the review page renders them — match how it reads the signature). Confirm `presignDownload` import path.

- [ ] **Step 3b: Answer-to-text helper**

```typescript
// lib/pdf/answer-text.ts
// Flattens a stored response answer (JSON, type-dependent) to display text for the PDF.
// Mirror the review detail page's per-type rendering — read app/review/[id] to match.
export function answerToText(type: string, answer: unknown): string {
  if (answer == null) return "—";
  if (type === "PHOTO") {
    const count = (answer as { count?: number }).count ?? 0;
    return `${count} photo${count === 1 ? "" : "s"}`;
  }
  if (type === "MULTI" && Array.isArray(answer)) return (answer as string[]).join(", ");
  if (type === "YESNO") return answer ? "Yes" : "No";
  if (type === "PASSFAIL") return String(answer);
  if (typeof answer === "object") return JSON.stringify(answer);
  return String(answer);
}
```

> Match this to how `app/review/[id]/page.tsx` renders each of the 11 types — read that file and align the text output (especially SINGLE/MULTI option labels, NUMBER, DATE formatting via `formatDateInET`). Keep it a pure function so it could be unit-tested later.

- [ ] **Step 4: Export PDF link on review detail**

In `app/review/[id]/page.tsx`, add a link (in the page header actions or status rail): `<a href={`/api/checklists/${id}/pdf`} ...>Export PDF</a>`.

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm build` — Expected: clean; `/api/checklists/[id]/pdf` route built. If feasible, hit the route for a seeded SUBMITTED instance and confirm a non-empty `application/pdf` body.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf app/api/checklists app/review/[id]/page.tsx
git commit -m "feat(pdf): single completed-checklist PDF export"
```

---

### Task 7: Report PDFs + final verification

**Files:**
- Create: `lib/pdf/CompletenessPdf.tsx`, `lib/pdf/IssuesPdf.tsx`, `app/api/reports/completeness/pdf/route.ts`, `app/api/reports/issues/pdf/route.ts`

**Interfaces:**
- Consumes: `renderPdfToBuffer`, `summarizeCompleteness`, the same queries as Tasks 4/5 (extract shared query logic if it reduces duplication, otherwise repeat — these are server-only).
- Produces: two report PDF routes wired to the `ReportFilters` "Export PDF" buttons (already pointing at these hrefs in Task 4/5).

- [ ] **Step 1: Completeness PDF document**

```tsx
// lib/pdf/CompletenessPdf.tsx
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";
import type { CompletenessRow } from "@/lib/reports";

export function CompletenessPdf({ rows, codeById, title }: { rows: CompletenessRow[]; codeById: Record<string, string>; title: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap orientation="landscape">
        <Text style={styles.h1}>{title}</Text>
        <View style={styles.tableHead}>
          {["Date", "Property", "Scheduled", "Complete", "Incomplete", "With issues", "%"].map((h) => (
            <Text key={h} style={styles.cell}>{h}</Text>
          ))}
        </View>
        {rows.map((r) => (
          <View key={`${r.propertyId}|${r.date}`} style={styles.row}>
            <Text style={styles.cell}>{r.date}</Text>
            <Text style={styles.cell}>{codeById[r.propertyId] ?? r.propertyId}</Text>
            <Text style={styles.cell}>{String(r.scheduled)}</Text>
            <Text style={styles.cell}>{String(r.completed)}</Text>
            <Text style={styles.cell}>{String(r.incomplete)}</Text>
            <Text style={styles.cell}>{String(r.withIssues)}</Text>
            <Text style={styles.cell}>{r.pct}%</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Issues PDF document** (same table pattern: Issue, Checklist, Property, Priority, Status, Created, SLA). Create `lib/pdf/IssuesPdf.tsx` taking a prepared `rows: { title; checklist; property; priority; status; created; sla }[]` array.

```tsx
// lib/pdf/IssuesPdf.tsx
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

export type IssuePdfRow = { title: string; checklist: string; property: string; priority: string; status: string; created: string; sla: string };

export function IssuesPdf({ rows, title }: { rows: IssuePdfRow[]; title: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap orientation="landscape">
        <Text style={styles.h1}>{title}</Text>
        <View style={styles.tableHead}>
          {["Issue", "Checklist", "Property", "Priority", "Status", "Created", "SLA"].map((h) => (
            <Text key={h} style={styles.cell}>{h}</Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cell}>{r.title}</Text>
            <Text style={styles.cell}>{r.checklist}</Text>
            <Text style={styles.cell}>{r.property}</Text>
            <Text style={styles.cell}>{r.priority}</Text>
            <Text style={styles.cell}>{r.status}</Text>
            <Text style={styles.cell}>{r.created}</Text>
            <Text style={styles.cell}>{r.sla}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: The two report PDF routes**

Create `app/api/reports/completeness/pdf/route.ts` and `app/api/reports/issues/pdf/route.ts`, each: `export const runtime = "nodejs"`, `auth()` 401-guard, re-derive the SAME scoped query as the matching report page (read `from`/`to`/`status`/`priority` from `req.nextUrl.searchParams`), build the rows, render via `renderPdfToBuffer`, return `application/pdf` with a `Completeness_RISE8_<MMDDYY>.pdf` / `IssuesFound_RISE8_<MMDDYY>.pdf` filename (use `etYYYYMMDD`/a date helper). Reuse the exact scope trio and `parseDateParam` from the report pages.

```tsx
// app/api/reports/completeness/pdf/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etYYYYMMDD } from "@/lib/datetime";
import { summarizeCompleteness, type StatusCount } from "@/lib/reports";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { CompletenessPdf } from "@/lib/pdf/CompletenessPdf";
import { IssueStatus } from "@prisma/client";

export const runtime = "nodejs";
const parseDateParam = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const OPEN_ISSUE = [IssueStatus.OPEN, IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = { id: session.user.id as string, role: session.user.role as never };
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);
  const properties = await accessibleProperties(user);
  const codeById = Object.fromEntries(properties.map((p) => [p.id, p.shortCode]));

  const from = parseDateParam(req.nextUrl.searchParams.get("from"));
  const to = parseDateParam(req.nextUrl.searchParams.get("to"));
  const dateWhere = from || to ? { scheduledFor: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  const grouped = await db.checklistInstance.groupBy({ by: ["propertyId", "scheduledFor", "status"], where: { propertyId: { in: scopeIds }, ...dateWhere }, _count: { _all: true } });
  const counts: StatusCount[] = grouped.map((g) => ({ propertyId: g.propertyId, scheduledFor: g.scheduledFor, status: g.status, count: g._count._all }));
  const issueInstances = await db.checklistInstance.findMany({ where: { propertyId: { in: scopeIds }, ...dateWhere, sourcedIssues: { some: { status: { in: OPEN_ISSUE } } } }, select: { propertyId: true, scheduledFor: true } });
  const withIssuesByKey: Record<string, number> = {};
  for (const i of issueInstances) { const k = `${i.propertyId}|${etYYYYMMDD(i.scheduledFor)}`; withIssuesByKey[k] = (withIssuesByKey[k] ?? 0) + 1; }
  const rows = summarizeCompleteness(counts, withIssuesByKey, etYYYYMMDD);

  const buffer = await renderPdfToBuffer(<CompletenessPdf rows={rows} codeById={codeById} title="Daily Completeness Report" />);
  return new NextResponse(buffer, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="Completeness_RISE8_${etYYYYMMDD().slice(2)}.pdf"`, "cache-control": "no-store" } });
}
```

Build the issues PDF route analogously, reusing Task 5's query + `isSlaBreached` to compute each row's `sla` string ("Breached"/"—") and mapping to `IssuePdfRow[]`.

- [ ] **Step 4: Final whole-plan verification**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run && pnpm build`
Expected: clean types/lint; all tests pass (prior + new reports/nav cases); build lists `/dashboard`, `/reports/completeness`, `/reports/issues`, `/api/checklists/[id]/pdf`, `/api/reports/completeness/pdf`, `/api/reports/issues/pdf`.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf app/api/reports
git commit -m "feat(pdf): completeness + issues report PDF export"
```

---

## Self-Review

**Spec coverage (spec §6h–k):**
- §6i Daily completeness report (per property/day: scheduled/complete/incomplete/with-issues/%) → Tasks 2,4. ✓
- §6i Issues-found report (filter property/date/status/priority, grouped by checklist) → Task 5. ✓
- §6j Manager dashboard (incomplete + with-issues + unassigned + completion %) → Task 3. ✓
- §6k PDF: single completed checklist (responses, photos w/ time+geo, signatures, start/complete) → Task 6; reports → Task 7. ✓
- §6h review→issues already exists (Phase 4) — not rebuilt. ✓

**Out of scope (correct):** bulk PDF export (spec defers it); Teams digest (Phase 7); recurrence polish (Plan 6); hard-delete (Plan 7).

**Placeholder scan:** full code for the de-risk gate, pure helper + tests, dashboard, completeness page, checklist PDF doc + route, and one report-PDF route; Task 5's status-control wiring and Task 7's issues-PDF route are "build analogously / reconcile" steps with the pattern fully shown in a sibling — acceptable, named, and each cites the file to mirror. No "TBD"/"handle errors" placeholders.

**Type consistency:** `summarizeCompleteness(counts, withIssuesByKey, ymd)` signature matches its callers in Task 4 + Task 7; `CompletenessRow` shared between helper, page, and PDF; `StatusCount` built identically from `groupBy` in both the page and the route; `renderPdfToBuffer(element)` used by all three PDF routes.

**Top risks flagged:** (1) **Task 1 is a hard gate** — `@react-pdf/renderer` under Next 15 + Turbopack + React 19 is unverified; if it can't build, stop and choose a fallback before Tasks 6/7. (2) Task 5/6/7 must reconcile exact `Issue` relation/field names and the signature-answer storage shape against the real schema/review page. (3) PDF routes use `auth()` + explicit 401/403 (not `requireUser`, which redirects) and re-check `canAccessProperty`.
