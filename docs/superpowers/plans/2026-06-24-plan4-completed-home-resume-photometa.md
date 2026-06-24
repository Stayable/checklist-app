# Plan 4 — Completed View + Home Revamp + Mark-Opened/Resume + Photo Timestamp/Geo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/completed` checklist browser, revamp Home into To-do / Done / Recently-completed with a Resume affordance, stamp a real start time when a checklist is first opened, and capture + display a reliable per-photo capture timestamp alongside the existing geolocation.

**Architecture:** Mark-opened is a server action invoked from the fill client's mount effect (stamps `openedAt` + flips `ASSIGNED/SCHEDULED → IN_PROGRESS` once). Photo capture time is captured client-side at photo-add (iOS strips EXIF, so EXIF is unreliable), threaded through the existing IndexedDB draft → submit pipeline exactly like the existing per-batch GPS, and persisted to a new additive `Photo.capturedAt` column. `/completed` and the revamped Home reuse the existing property-scope + datetime helpers and model their queries on the existing `/review` queue.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Prisma/Neon, Vitest, shadcn/Tailwind, server actions, `idb` (IndexedDB), `date-fns-tz` via `lib/datetime.ts`.

## Global Constraints

- TypeScript strict; no `any` without a documented reason.
- Zod validation at every server-action boundary; return the existing `ActionResult` discriminated-union style where the file already uses it.
- All datetimes display in `America/New_York` via `lib/datetime.ts` — never call `toLocaleString`/`Intl` directly. `formatInET(v, pattern?)` returns a string **with** a trailing ` ET`; `formatDateInET(v, pattern?)` returns **without** ` ET`. Use `formatInET` for timestamps that need the ET suffix, `formatDateInET` for plain dates.
- Mutations write an `audit_log` row through the file's existing audit pattern where one exists; mark-opened is a system stamp (audit optional — match the submit action's level of logging).
- Migrations apply to the SHARED prod Neon DB — **additive only** in this plan (one new nullable column). No destructive changes.
- Prisma singleton: `import { db } from "@/lib/db"`.
- Property scope: list surfaces use `accessiblePropertyIds(user)` + `getCurrentPropertyId(accessibleIds)` + `resolveScopedPropertyIds(accessibleIds, activeId)` (the established trio).
- Instance status enum: `SCHEDULED, ASSIGNED, IN_PROGRESS, SUBMITTED, REVIEWED, FLAGGED, INVALIDATED, EXPIRED`. "Done" = `SUBMITTED || REVIEWED` (matches the existing `isDone` on Home).
- Pages render inside the AppShell (content only) using `PageHeader` from `components/shell/PageHeader.tsx`.
- Photo geofence/GPS pipeline (ADR-015) is NOT being changed — GPS is already captured per batch and travels with the draft. This plan only ADDS a capture timestamp alongside it and surfaces both.

## Decisions resolved for this plan

1. **New column, not EXIF reuse.** `Photo.exifTimestamp` stays for genuine EXIF; add a distinct nullable `Photo.capturedAt` for the client-captured time. Semantically honest and avoids conflating the two.
2. **Mark-opened is client-mount-triggered.** A server action `markOpened(instanceId)` is called from `FillClient`'s existing mount effect (fire-and-forget), guarded server-side: only the assignee, only when status ∈ {SCHEDULED, ASSIGNED} and `openedAt` is null. This avoids mutating during a server-component GET render.
3. **Capture time mirrors GPS plumbing.** Capture `Date.now()` (epoch ms) at `addPhotos`, store parallel to `photoPositions` in the draft as `photoTimestamps`, thread it into the per-photo submit payload (`capturedAt`), validate + persist server-side.
4. **`/completed` is MANAGER+** (review surface), property-scoped, rows link to the existing `/review/[id]` detail. Home stays per-user-own-assignments for everyone (portfolio rollups are Plan 5's dashboard).
5. **PDF display of timestamps is Plan 5** — this plan surfaces timestamp+geo only in review detail and `/completed`.

---

## File Structure

**Create:**
- `lib/mark-opened.ts` — pure `shouldMarkOpened(status, openedAt, isAssignee)`.
- `lib/mark-opened.test.ts` — Vitest.
- `app/checklists/[id]/mark-opened.action.ts` — `markOpened(instanceId)` server action.
- `app/completed/page.tsx` — completed-checklist browser (server).
- `app/completed/CompletedFilters.tsx` — client filter controls (property/date/assignee).
- `components/review/PhotoFigure.tsx` — shared photo tile rendering image + geofence badge + capture timestamp + coords (extracted from `/review/[id]`, reused by completed/detail).

**Modify:**
- `prisma/schema.prisma` — add `Photo.capturedAt DateTime?`.
- `app/checklists/[id]/FillClient.tsx` — capture `Date.now()` per batch; thread `capturedAt` through draft + submit payload; call `markOpened` on mount.
- `lib/draft-store.ts` — add `photoTimestamps?: Record<string, (number | null)[]>` to `ChecklistDraft`.
- `app/checklists/[id]/actions.ts` — accept + validate `capturedAt` per photo; write `Photo.capturedAt`.
- `app/review/[id]/page.tsx` — extend `PhotoView` with `capturedAt`/`gpsLat`/`gpsLng`; render via `PhotoFigure`.
- `app/page.tsx` — revamp into To-do today / Done today / Recently completed + Resume affordance.
- `lib/nav.ts` — add `Completed` to the manager nav; update `lib/nav.test.ts`.

---

### Task 1: Schema — `Photo.capturedAt`

**Files:**
- Modify: `prisma/schema.prisma` (Photo model ~376-403)
- Migration: `prisma/migrations/<ts>_photo_captured_at/`

**Interfaces:**
- Produces: `Photo.capturedAt: DateTime | null` (`@map("captured_at") @db.Timestamptz`). Tasks 3/4 read+write it.

- [ ] **Step 1: Add the column**

In `model Photo`, add after `exifTimestamp`:

```prisma
  capturedAt     DateTime?      @map("captured_at") @db.Timestamptz
```

- [ ] **Step 2: Create + apply the migration**

Run:

```bash
pnpm prisma migrate dev --name photo_captured_at
```

Expected: additive `ALTER TABLE "photos" ADD COLUMN "captured_at" TIMESTAMPTZ;`, applied cleanly; `prisma generate` runs. If the tool wants to reset/drop anything, STOP and report BLOCKED.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): Photo.capturedAt for client-captured photo time"
```

---

### Task 2: Mark-opened — pure guard + server action + fill wiring

**Files:**
- Create: `lib/mark-opened.ts`, `lib/mark-opened.test.ts`, `app/checklists/[id]/mark-opened.action.ts`
- Modify: `app/checklists/[id]/FillClient.tsx` (mount effect)

**Interfaces:**
- Produces: `shouldMarkOpened(status: InstanceStatus, openedAt: Date | null, isAssignee: boolean): boolean`; `markOpened(instanceId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/mark-opened.test.ts
import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@prisma/client";
import { shouldMarkOpened } from "./mark-opened";

describe("shouldMarkOpened", () => {
  it("stamps a fresh ASSIGNED instance opened by its assignee", () => {
    expect(shouldMarkOpened(InstanceStatus.ASSIGNED, null, true)).toBe(true);
  });
  it("stamps a SCHEDULED (unassigned-then-picked-up) instance", () => {
    expect(shouldMarkOpened(InstanceStatus.SCHEDULED, null, true)).toBe(true);
  });
  it("does not re-stamp once openedAt is set", () => {
    expect(shouldMarkOpened(InstanceStatus.IN_PROGRESS, new Date(), true)).toBe(false);
  });
  it("does not stamp for a non-assignee (manager viewing)", () => {
    expect(shouldMarkOpened(InstanceStatus.ASSIGNED, null, false)).toBe(false);
  });
  it("does not stamp a submitted/reviewed instance", () => {
    expect(shouldMarkOpened(InstanceStatus.SUBMITTED, null, true)).toBe(false);
    expect(shouldMarkOpened(InstanceStatus.REVIEWED, null, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/mark-opened.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pure guard**

```typescript
// lib/mark-opened.ts
import { InstanceStatus } from "@prisma/client";

// A checklist's real start time is stamped the first time its assignee opens it
// (ADR-018 epic). Only an un-started, assignee-opened instance qualifies.
export function shouldMarkOpened(
  status: InstanceStatus,
  openedAt: Date | null,
  isAssignee: boolean,
): boolean {
  if (!isAssignee) return false;
  if (openedAt !== null) return false;
  return status === InstanceStatus.SCHEDULED || status === InstanceStatus.ASSIGNED;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/mark-opened.test.ts` — Expected: PASS (5).

- [ ] **Step 5: Write the server action**

```typescript
// app/checklists/[id]/mark-opened.action.ts
"use server";

import { InstanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { shouldMarkOpened } from "@/lib/mark-opened";

// Idempotent: stamps openedAt + flips to IN_PROGRESS the first time the assignee
// opens the checklist. Safe to call on every mount — guarded by shouldMarkOpened.
export async function markOpened(instanceId: string): Promise<void> {
  const user = await requireUser();
  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    select: { assignedUserId: true, status: true, openedAt: true },
  });
  if (!instance) return;
  const isAssignee = instance.assignedUserId === user.id;
  if (!shouldMarkOpened(instance.status, instance.openedAt, isAssignee)) return;

  // Conditional update guards against a concurrent double-open race: only stamp
  // when openedAt is still null.
  await db.checklistInstance.updateMany({
    where: { id: instanceId, openedAt: null },
    data: { openedAt: new Date(), status: InstanceStatus.IN_PROGRESS },
  });
}
```

- [ ] **Step 6: Call it from the fill client mount**

In `app/checklists/[id]/FillClient.tsx`: import the action, and add a one-shot call in the existing mount effect (the same effect that calls `loadDraft`, or a sibling effect). It must fire once on mount and never block rendering:

```typescript
import { markOpened } from "./mark-opened.action";
// ...inside the component, after existing hooks:
useEffect(() => {
  void markOpened(instanceId);
}, [instanceId]);
```

Place it so it does not interfere with the draft-restore effect. `markOpened` is server-guarded, so calling it for a manager/non-assignee is a no-op.

- [ ] **Step 7: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run lib/mark-opened.test.ts`
Expected: clean; test passes.

- [ ] **Step 8: Commit**

```bash
git add lib/mark-opened.ts lib/mark-opened.test.ts app/checklists/[id]/mark-opened.action.ts app/checklists/[id]/FillClient.tsx
git commit -m "feat(checklists): mark-opened stamps openedAt + IN_PROGRESS on first open"
```

---

### Task 3: Photo capture timestamp — capture → draft → submit → persist

**Files:**
- Modify: `lib/draft-store.ts`, `app/checklists/[id]/FillClient.tsx`, `app/checklists/[id]/actions.ts`

**Interfaces:**
- Consumes: existing photo pipeline (capture → IndexedDB draft → presigned upload-at-submit → submit action `PhotoRow` → `Photo` rows).
- Produces: a `capturedAt` epoch-ms value flowing per photo end-to-end, persisted to `Photo.capturedAt`.

> **Trace before editing.** The exact submit-side upload code (where blobs are presigned and the per-photo answer array `{key,lat,lng,accuracy,sizeBytes}` is built) and the submit action's photo extraction into `PhotoRow` are in `FillClient.tsx` and `app/checklists/[id]/actions.ts`. Read both fully and thread `capturedAt` through every hop named below. The anchors:
> - **Capture (FillClient `addPhotos`)**: a `PhotoItem` is `{ blob, url, position }`. GPS is attached async after capture. Capture time must be recorded at the moment `addPhotos` runs (a single `Date.now()` for the batch is correct — it is the capture instant).
> - **Draft (`lib/draft-store.ts`)**: `ChecklistDraft` has `photos: Record<string, Blob[]>` and `photoPositions?: Record<string, (Position|null)[]>`. Add a parallel `photoTimestamps?: Record<string, (number|null)[]>`.
> - **Submit payload**: the per-photo object currently carries `{key,lat,lng,accuracy,sizeBytes}`. Add `capturedAt: number | null`.
> - **Submit action `PhotoRow`** (`{questionId,r2Key,fileSizeBytes,gpsLat,gpsLng,geofenceStatus}`): add `capturedAt: Date | null`, and include it in the `tx.photo.createMany` data.

- [ ] **Step 1: Extend the draft type**

In `lib/draft-store.ts`, add to `ChecklistDraft`:

```typescript
  // Client capture time (epoch ms) per photo, parallel to `photos` arrays.
  // Optional because older drafts lack it. iOS strips EXIF, so this is the
  // reliable capture time (ADR-021 photo metadata).
  photoTimestamps?: Record<string, (number | null)[]>;
```

- [ ] **Step 2: Capture the timestamp in `addPhotos` + persist in the draft + send at submit (FillClient)**

In `app/checklists/[id]/FillClient.tsx`:
1. Extend `PhotoItem` to `{ blob; url; position: Position | null; capturedAt: number }`.
2. In `addPhotos`, set `capturedAt: Date.now()` on each new `PhotoItem` (one `Date.now()` captured once at the top of the callback, applied to the batch).
3. In the draft auto-save effect, build `photoTimestamps[qid] = items.map(it => it.capturedAt)` parallel to `photoBlobs`/`photoPositions`, and pass it to `saveDraft`.
4. In the draft-restore effect, restore `capturedAt` from `draft.photoTimestamps?.[qid]?.[i] ?? Date.now()` (fallback for legacy drafts).
5. In the submit upload code, when building each per-photo answer object, add `capturedAt: it.capturedAt` (epoch ms).

Show the reconciled `addPhotos` `PhotoItem` construction:

```typescript
const capturedAt = Date.now();
const items: PhotoItem[] = compressed.map((c) => ({
  blob: c.blob,
  url: URL.createObjectURL(c.blob),
  position: null,
  capturedAt,
}));
```

- [ ] **Step 3: Accept + validate + persist `capturedAt` in the submit action**

In `app/checklists/[id]/actions.ts`:
1. Extend the Zod schema for the per-photo object to accept `capturedAt: z.number().int().positive().nullable().optional()`.
2. Add `capturedAt: Date | null` to the `PhotoRow` type; set it from the validated value: `capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : null`.
3. Add `capturedAt: r.capturedAt` to the `tx.photo.createMany` data mapping.

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm build`
Expected: clean types/lint; build succeeds. (No new unit test — covered by the existing submit path + manual capture; the pipeline is exercised end-to-end during review of Task 4.)

- [ ] **Step 5: Commit**

```bash
git add lib/draft-store.ts app/checklists/[id]/FillClient.tsx app/checklists/[id]/actions.ts
git commit -m "feat(photos): capture client photo timestamp through draft+submit to Photo.capturedAt"
```

---

### Task 4: Photo display — shared `PhotoFigure` with timestamp + geo

**Files:**
- Create: `components/review/PhotoFigure.tsx`
- Modify: `app/review/[id]/page.tsx`

**Interfaces:**
- Produces: `PhotoFigure({ url, geofenceStatus, capturedAt, gpsLat, gpsLng })` — a tile showing the image, the geofence badge, and (when present) the ET capture time + coordinates. `PhotoView` extended to carry `capturedAt: string | null` (preformatted ET) and `gpsLat`/`gpsLng` (string|null). Reused by `/completed` later if it shows photos; primary use is review detail.

- [ ] **Step 1: Build `PhotoFigure`**

```tsx
// components/review/PhotoFigure.tsx
import { GeofenceStatus } from "@prisma/client";

const GEOFENCE_BADGE: Record<GeofenceStatus, { label: string; cls: string }> = {
  [GeofenceStatus.VERIFIED]: { label: "On property", cls: "bg-emerald-50 text-emerald-700" },
  [GeofenceStatus.OFF_PROPERTY]: { label: "Off property", cls: "bg-red-50 text-red-700" },
  [GeofenceStatus.NO_GPS]: { label: "No GPS", cls: "bg-slate-100 text-slate-500" },
  [GeofenceStatus.UNVERIFIED]: { label: "No geofence set", cls: "bg-amber-50 text-amber-700" },
};

export type PhotoFigureProps = {
  url: string;
  geofenceStatus: GeofenceStatus;
  capturedAt: string | null; // preformatted ET, e.g. "Jun 24, 2026 2:30 PM ET"
  gpsLat: string | null;
  gpsLng: string | null;
};

export function PhotoFigure({ url, geofenceStatus, capturedAt, gpsLat, gpsLng }: PhotoFigureProps) {
  const badge = GEOFENCE_BADGE[geofenceStatus];
  return (
    <figure className="flex w-32 flex-col gap-1">
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL */}
        <img src={url} alt="Checklist photo" className="h-32 w-32 rounded-lg border border-slate-200 object-cover" />
      </a>
      <figcaption className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
        {badge.label}
      </figcaption>
      {capturedAt && <span className="text-[11px] leading-tight text-slate-500">{capturedAt}</span>}
      {gpsLat && gpsLng && (
        <span className="text-[11px] leading-tight text-slate-400">
          {gpsLat}, {gpsLng}
        </span>
      )}
    </figure>
  );
}
```

- [ ] **Step 2: Wire it into review detail**

In `app/review/[id]/page.tsx`:
1. Extend the photo query select to include `capturedAt`, `gpsLat`, `gpsLng` (alongside `r2Key`, `geofenceStatus`).
2. Extend `PhotoView` to `{ url; geofenceStatus; capturedAt: string | null; gpsLat: string | null; gpsLng: string | null }`.
3. When building each `PhotoView`, format: `capturedAt: p.capturedAt ? formatInET(p.capturedAt) : null` (import `formatInET` from `@/lib/datetime`), and stringify coords: `gpsLat: p.gpsLat?.toString() ?? null` (Prisma `Decimal` → string), same for `gpsLng`.
4. Replace the inline `<figure>` photo block with `<PhotoFigure key={i} {...p} />`.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm build`
Expected: clean; build succeeds. Review detail renders timestamp+coords on photos that have them; legacy photos (null) show only the badge.

- [ ] **Step 4: Commit**

```bash
git add components/review/PhotoFigure.tsx app/review/[id]/page.tsx
git commit -m "feat(review): show photo capture time + coords via shared PhotoFigure"
```

---

### Task 5: `/completed` checklist browser

**Files:**
- Create: `app/completed/page.tsx`, `app/completed/CompletedFilters.tsx`

**Interfaces:**
- Consumes: `requireManager`, `accessiblePropertyIds`, `accessibleProperties` (`lib/rbac.ts`); `getCurrentPropertyId`/`resolveScopedPropertyIds`; `formatDateInET`; `PageHeader`.
- Produces: the `/completed` route. Reads optional URL search params `from`, `to`, `assignee` for filtering.

- [ ] **Step 1: Build the filters client**

```tsx
// app/completed/CompletedFilters.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type AssigneeOpt = { id: string; name: string };

export function CompletedFilters({ assignees }: { assignees: AssigneeOpt[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/completed?${next.toString()}`);
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
      <label className="text-sm text-slate-600">Assignee
        <select defaultValue={params.get("assignee") ?? ""} onChange={(e) => set("assignee", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Build the completed page (server)**

```tsx
// app/completed/page.tsx
import Link from "next/link";
import { InstanceStatus } from "@prisma/client";
import { requireManager, accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etDateOnly, formatDateInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { CompletedFilters } from "./CompletedFilters";

const STATUS_PILL: Partial<Record<InstanceStatus, string>> = {
  [InstanceStatus.SUBMITTED]: "bg-blue-50 text-blue-700",
  [InstanceStatus.REVIEWED]: "bg-emerald-50 text-emerald-700",
};

export default async function CompletedPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; assignee?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);
  const properties = await accessibleProperties(user);

  // ET date range → UTC-midnight Date bounds against scheduledFor (a @db.Date).
  const fromDate = sp.from ? etDateOnly(sp.from) : null;
  const toDate = sp.to ? etDateOnly(sp.to) : null;

  const instances = await db.checklistInstance.findMany({
    where: {
      propertyId: { in: scopeIds },
      status: { in: [InstanceStatus.SUBMITTED, InstanceStatus.REVIEWED] },
      ...(sp.assignee ? { assignedUserId: sp.assignee } : {}),
      ...(fromDate || toDate
        ? { scheduledFor: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
    },
    orderBy: [{ submittedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      status: true,
      submittedAt: true,
      scheduledFor: true,
      template: { select: { name: true } },
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { name: true } },
    },
  });

  // Assignee filter options: users assigned to the in-scope completed set.
  const assignees = Array.from(
    new Map(
      instances
        .filter((i) => i.assignedUser)
        .map((i) => [i.assignedUserId, { id: i.assignedUserId!, name: i.assignedUser!.name }] as const),
    ).values(),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Completed checklists" subtitle={`${instances.length} in view`} />
      <CompletedFilters assignees={assignees} />
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Checklist</th>
              <th className="px-4 py-2">Property</th>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2">Assignee</th>
              <th className="px-4 py-2">Submitted</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {instances.map((i) => (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{i.title ?? i.template.name}</td>
                <td className="px-4 py-2">{i.property.shortCode}</td>
                <td className="px-4 py-2">{i.room?.roomNumber ?? "—"}</td>
                <td className="px-4 py-2">{i.assignedUser?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">
                  {i.submittedAt ? formatDateInET(i.submittedAt) : formatDateInET(i.scheduledFor)}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[i.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/review/${i.id}`} className="font-medium text-navy hover:underline">Open</Link>
                </td>
              </tr>
            ))}
            {instances.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No completed checklists in this scope/range.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

> Verify `etDateOnly` accepts a `"yyyy-MM-dd"` string (the map shows `etDateOnly(value: Date|string|number)`). If a bare date string is interpreted in the wrong zone, pass it through the same path the rest of the app uses for date-only inputs (check an existing date-param consumer if one exists; otherwise `etDateOnly(sp.from)` is correct per the helper signature).

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm build`
Expected: clean; `/completed` route present.

- [ ] **Step 4: Commit**

```bash
git add app/completed
git commit -m "feat(completed): property-scoped completed-checklist browser w/ filters"
```

---

### Task 6: Home revamp — To-do / Done / Recently completed + Resume

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `requireUser`, `etDateOnly`, `formatDateInET`, `db`.
- Produces: the revamped Home. No downstream consumers.

- [ ] **Step 1: Rebuild the Home query + sections**

Rework `app/page.tsx` to:
1. Keep the today's-assignments query (`assignedUserId: user.id`, `scheduledFor: today`) but ALSO fetch a "recently completed" set (last 5 by `submittedAt desc`, `assignedUserId: user.id`, status ∈ {SUBMITTED, REVIEWED}, not limited to today). Add `openedAt`, `submittedAt`, `id`, `title` to the selects as needed.
2. Split today's assignments into **To do today** (`status ∈ {SCHEDULED, ASSIGNED, IN_PROGRESS, FLAGGED}`) and **Done today** (`status ∈ {SUBMITTED, REVIEWED}`).
3. In the To-do section, when an item's `status === IN_PROGRESS`, render the card CTA as **"Resume"** (vs "Start"/"Open" otherwise); the link target is the existing `/checklists/[id]`.
4. Add a **Recently completed** section below, each row linking to `/checklists/[id]` (or `/review/[id]` is manager-only — field staff should link to the fill/read view `/checklists/[id]`), showing title + property + submitted date (`formatDateInET`).
5. Preserve the existing progress bar / `pct` computation over *today's* items, the status `pill` helper, and the admin link block (lines ~86-95). Reuse `instance.title ?? template.name` for labels.

Keep the component a server component; do not introduce a client component unless a control needs interactivity (it doesn't — links only).

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm build`
Expected: clean; Home builds.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): split To-do/Done today + recently completed + Resume affordance"
```

---

### Task 7: Nav — add Completed

**Files:**
- Modify: `lib/nav.ts`, `lib/nav.test.ts`

**Interfaces:**
- Produces: `Completed` nav item for MANAGER/CORPORATE/ADMIN.

- [ ] **Step 1: Extend the nav test**

Add to `lib/nav.test.ts`:

```typescript
it("MANAGER sees Completed", () => {
  expect(navItemsForRole(Role.MANAGER).some((n) => n.href === "/completed")).toBe(true);
});
it("field staff do NOT see Completed", () => {
  expect(navItemsForRole(Role.HK).some((n) => n.href === "/completed")).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/nav.test.ts` — Expected: FAIL on the new cases.

- [ ] **Step 3: Add the nav item**

In `lib/nav.ts`, add to `MAIN_MANAGER` (after Templates):

```typescript
  { href: "/completed", label: "Completed", group: "main" },
```

If the existing "admin gets management surfaces..." exact-array test asserts the full ordered MAIN_MANAGER list, update its expected array to include `/completed` in the new position.

- [ ] **Step 4: Run to verify it passes + full suite**

Run: `pnpm vitest run lib/nav.test.ts && pnpm tsc --noEmit && pnpm lint && pnpm vitest run && pnpm build`
Expected: all green; build lists `/completed`.

- [ ] **Step 5: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts
git commit -m "feat(nav): add Completed to manager nav"
```

---

## Self-Review

**Spec coverage (spec §6d completed view, §6e mark-opened/resume, §6f home revamp, §6g photo metadata):**
- §6d `/completed` filtered by property/date/assignee, rows → review detail → Task 5. ✓
- §6e mark-opened stamps `openedAt` + IN_PROGRESS on first open → Task 2; resume affordance on Home → Task 6 (same-device IndexedDB resume already works). ✓
- §6f Home split To-do/Done + Recently completed → Task 6. ✓
- §6g photo capture timestamp captured reliably client-side + displayed with geo (review detail; PDF deferred to Plan 5) → Tasks 1,3,4. ✓
- Geolocation already captured (ADR-015) — unchanged, only surfaced → Task 4. ✓

**Out of scope (correct):** PDF export of photos/timestamps (Plan 5), manager dashboard/reports (Plan 5), portfolio rollups (Plan 5).

**Placeholder scan:** code steps carry full code for the testable cores (pure guard, action, PhotoFigure, completed page, filters). Tasks 3 and 6 are "trace + thread/rework" steps against existing files with named anchors and the exact field/shape changes — the implementer reconciles exact line numbers, consistent with how Plan 3's integration tasks were specified. No "TBD"/"add error handling" placeholders.

**Type consistency:** `shouldMarkOpened(status, openedAt, isAssignee)` signature matches its action call site; `capturedAt` is epoch-ms (number) client-side end-to-end and `Date | null` server-side (converted once in the submit action); `PhotoFigure` props match the extended `PhotoView` in Task 4; `Photo.capturedAt` (Task 1) is what Tasks 3/4 write/read.

**Known risks flagged:** Task 3 is the highest-touch (client + persistence across 3 files) — its review must confirm `capturedAt` survives every hop (capture → draft save/restore → submit payload → PhotoRow → DB) and that legacy drafts/answers without it don't break (all paths use `?? null`/`?? Date.now()`). Task 5's `etDateOnly(string)` zone handling must be verified against the helper.
