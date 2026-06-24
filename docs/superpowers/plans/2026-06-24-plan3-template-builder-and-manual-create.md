# Plan 3 — Template Builder + Manual Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only template view into an editable builder (ADMIN all properties, MANAGER own properties), make templates property-scoped, and let managers create a checklist instance manually (immediate, status ASSIGNED) — with empty states routing to the builder.

**Architecture:** New `template_properties` join + `allProperties` flag make templates property-scoped (extends ADR-013); the active-property header filter drives the template list and manual-create options. Template CRUD lives at `/templates` (moved out of `/admin`) behind role-aware guards. Manual create at `/checklists/new` mirrors `generateForDate()`'s ADR-009 system-ID/seq logic for a single immediate instance. Pure logic (code derivation, property access) is extracted into unit-tested helpers; UI follows the existing server-component + client-`Manager` + server-action pattern.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict), Prisma + Neon Postgres, Zod, Vitest, shadcn/ui + Tailwind, server actions.

## Global Constraints

- TypeScript strict mode; no `any` without a documented reason.
- Zod validation at every server-action boundary; return the `ActionResult` discriminated union (`{ ok: true; ... } | { ok: false; error: string }`).
- Every create/update/delete writes an `audit_log` row via the existing pattern (`db.auditLog.create({ data: { actorUserId, entityType, entityId, action, before?, after? } })`).
- Server actions call `revalidatePath(...)` after mutating.
- All datetimes display in `America/New_York` through `lib/datetime.ts` — never call `toLocaleString` directly.
- File naming for any shared doc artifact: `Title_RISE8_MMDDYY.ext` (not relevant to source files here).
- Prisma client is the singleton from `lib/db.ts` (`import { db } from "@/lib/db"`).
- Migrations applied locally hit the shared prod Neon DB — additive only in this plan (new nullable column, new table). No destructive changes (placeholder hard-delete is Plan 7).
- Template `code` is `VARCHAR(8)` and `@unique`. Derived codes must be ≤8 chars and unique.
- ADR-009 system ID format: `CL-{propertyId}-{templateCode}-{YYYYMMDD}-{seq}`, seq zero-padded 3-digit, **restarting at 001 each ET day per (property, template)**. Reuse `buildSystemId` / `buildHumanLabel` from `lib/recurrence.ts` — do not reimplement.

## Decisions resolved for this plan (spec §10 open items)

1. **Template code auto-derivation** — pure `deriveTemplateCode(title, existing)`: uppercase, split on non-alphanumerics, take word initials; if <2 usable chars fall back to the alphanumerics of the longest word; truncate base to 6 chars; if taken, append `2`,`3`,… keeping ≤8 chars. Implemented + tested in Task 2.
2. **Manager template scope** — On **create**, a MANAGER/CORPORATE may attach **only properties in their accessible set** and **may not** set "All properties" (standardized all-property templates are ADMIN-only). On **edit/delete**, a manager may mutate a template **only if** `allProperties === false` **and every** associated property is within their accessible set (prevents editing a template that also touches a property they don't own). ADMIN is unrestricted. **⚠ Flag for Kate:** this is the conservative reading of spec §6a; confirm managers should not be able to edit shared cross-property or All-properties templates.
3. **Template → property model** — `ChecklistTemplate.allProperties Boolean @default(false)` + new `TemplateProperty(templateId, propertyId)` join with a unique pair. A template applies at property X iff `allProperties === true OR a TemplateProperty(templateId, X)` row exists. An "All properties" template has `allProperties=true` and no join rows.
4. **Instance title override** — add nullable `ChecklistInstance.title`. Manual create requires a title (defaults client-side to `"{template name} — {Mon D, YYYY}"`); display falls back to `buildHumanLabel(...)` when `title` is null (all existing/auto-generated instances).
5. **Manual create status** — mirror `generateForDate`: assignee chosen → `ASSIGNED`; left unassigned → `SCHEDULED`. PER_ROOM templates require a room; PER_PROPERTY/AD_HOC set `roomId = null`.
6. **The 9 placeholder templates** keep `allProperties=true` (set in the Task 1 seed update) so they remain offered everywhere until the Plan 7 hard-delete.

---

## File Structure

**Create:**
- `lib/template-code.ts` — pure `deriveTemplateCode(title, existing)`.
- `lib/template-code.test.ts` — Vitest.
- `lib/template-access.ts` — pure `templateAppliesToProperty`, `canManageTemplate`.
- `lib/template-access.test.ts` — Vitest.
- `app/templates/page.tsx` — template list (role-aware, property-scoped).
- `app/templates/actions.ts` — `createTemplate`, `updateTemplate`, `deleteTemplate` server actions.
- `app/templates/TemplatesClient.tsx` — list + "New template" entry (client).
- `app/templates/TemplateBuilder.tsx` — builder form (fields + Available-at-properties + question editor).
- `app/templates/[id]/page.tsx` — edit existing template (loads + guards, renders builder).
- `app/templates/new/page.tsx` — new template (renders empty builder).
- `app/checklists/new/page.tsx` — manual-create form page (in shell).
- `app/checklists/new/actions.ts` — `createInstanceManually` server action.
- `app/checklists/new/ManualCreateClient.tsx` — manual-create client form.
- `lib/manual-create.ts` — pure `nextManualLabelDefault(templateName, date)` (title default) — small, shared, testable.
- `lib/manual-create.test.ts` — Vitest.

**Modify:**
- `prisma/schema.prisma` — add `allProperties`, `TemplateProperty`, `ChecklistInstance.title`, relations.
- `prisma/seed.ts` (or `prisma/templates.ts`) — set `allProperties=true` on the 9 placeholders.
- `lib/nav.ts` — add `Templates` to MAIN_MANAGER; remove from ADMIN_GROUP; refine `shouldHideShell` so `/checklists/new` shows the shell while `/checklists/[id]` stays bare; update tests.
- `lib/nav.test.ts` — extend (file exists from Plan 1; confirm path during Task 7).
- `app/admin/templates/page.tsx` — replace body with a redirect to `/templates` (keep old link working).

---

### Task 1: Schema — property-scoped templates + instance title

**Files:**
- Modify: `prisma/schema.prisma` (ChecklistTemplate ~210-228, Property ~151-169, ChecklistInstance ~291-340)
- Modify: `prisma/templates.ts` (placeholder seed — set `allProperties`)
- Migration: `prisma/migrations/<timestamp>_template_properties_and_instance_title/`

**Interfaces:**
- Produces: `ChecklistTemplate.allProperties: boolean`; `TemplateProperty { templateId, propertyId }`; `ChecklistInstance.title: string | null`. Later tasks read `template.allProperties` and `template.properties` (the join rows) and write `instance.title`.

- [ ] **Step 1: Add the `allProperties` flag + `properties` relation to `ChecklistTemplate`**

In `prisma/schema.prisma`, inside `model ChecklistTemplate`, add after `active`:

```prisma
  allProperties Boolean @default(false) @map("all_properties")
```

and add to its relation block (alongside `questions`, `recurringRules`, `instances`):

```prisma
  properties TemplateProperty[]
```

- [ ] **Step 2: Add the `TemplateProperty` join model**

Add a new model (place it right after `model Question`):

```prisma
model TemplateProperty {
  id         String @id @default(uuid()) @db.Uuid
  templateId String @map("template_id") @db.Uuid
  propertyId String @map("property_id") @db.Uuid

  template ChecklistTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  property Property          @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@unique([templateId, propertyId])
  @@index([propertyId])
  @@map("template_properties")
}
```

- [ ] **Step 3: Add the back-relation on `Property`**

In `model Property`, add to the relations list (alongside `users`, `rooms`, ...):

```prisma
  templateProperties TemplateProperty[]
```

- [ ] **Step 4: Add `title` to `ChecklistInstance`**

In `model ChecklistInstance`, add after `systemId`:

```prisma
  title String?
```

- [ ] **Step 5: Create + apply the migration**

Run:

```bash
pnpm prisma migrate dev --name template_properties_and_instance_title
```

Expected: migration created and applied to the Neon DB; `prisma generate` runs; no errors. (This touches the shared prod schema — additive only, safe.)

- [ ] **Step 6: Mark the 9 placeholder templates `allProperties: true` in the seed**

In `prisma/templates.ts`, find each template upsert/create and add `allProperties: true` to its `data`/`create`/`update` payload (so re-seeding keeps them offered everywhere until Plan 7 deletes them). If templates are defined as an array mapped into upserts, add `allProperties: true` to the shared payload mapping.

- [ ] **Step 7: Re-run the seed and verify**

Run:

```bash
pnpm prisma db seed
```

Expected: completes without error. Then verify:

```bash
pnpm prisma studio
```

Expected: all 9 `checklist_templates` rows show `all_properties = true`; `template_properties` table exists and is empty.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/templates.ts prisma/migrations
git commit -m "feat(schema): property-scoped templates + instance title override (ADR-020)"
```

---

### Task 2: Pure helper — template code derivation

**Files:**
- Create: `lib/template-code.ts`
- Test: `lib/template-code.test.ts`

**Interfaces:**
- Produces: `deriveTemplateCode(title: string, existing: Iterable<string>): string` — returns a unique uppercase code, 1–8 chars. Task 4's `createTemplate` consumes it.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/template-code.test.ts
import { describe, expect, it } from "vitest";
import { deriveTemplateCode } from "./template-code";

describe("deriveTemplateCode", () => {
  it("uses word initials, uppercased", () => {
    expect(deriveTemplateCode("Pool Safety Check", [])).toBe("PSC");
  });

  it("falls back to the longest word when too few initials", () => {
    expect(deriveTemplateCode("Roofing", [])).toBe("ROOFIN"); // truncated to 6
  });

  it("strips non-alphanumerics", () => {
    expect(deriveTemplateCode("HVAC / Service!", [])).toBe("HS");
  });

  it("appends a numeric suffix on collision, staying <= 8 chars", () => {
    expect(deriveTemplateCode("Pool Safety Check", ["PSC"])).toBe("PSC2");
    expect(deriveTemplateCode("Pool Safety Check", ["PSC", "PSC2"])).toBe("PSC3");
  });

  it("truncates the base to leave room for a dedup suffix", () => {
    // base would be ABCDEFGH (8); truncated to 6 so suffix fits
    expect(deriveTemplateCode("Aa Bb Cc Dd Ee Ff Gg Hh", [])).toBe("ABCDEF");
  });

  it("never exceeds 8 chars even with multi-digit suffixes", () => {
    const taken = Array.from({ length: 11 }, (_, i) =>
      i === 0 ? "ABCDEF" : `ABCDEF${i + 1}`,
    );
    const out = deriveTemplateCode("Aa Bb Cc Dd Ee Ff", taken);
    expect(out.length).toBeLessThanOrEqual(8);
    expect(taken).not.toContain(out);
  });

  it("falls back to a default base when title has no alphanumerics", () => {
    expect(deriveTemplateCode("!!!", [])).toBe("TMPL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/template-code.test.ts`
Expected: FAIL — `deriveTemplateCode is not a function` / module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/template-code.ts
// Derives a unique <=8-char uppercase template code for the ADR-009 system ID
// (CL-{prop}-{CODE}-{date}-{seq}). Custom (manager/admin-authored) templates
// need a code; the 9 placeholders keep their hand-assigned 3-letter codes.

const MAX = 8;
const BASE_MAX = 6; // leave room for a dedup suffix

function baseFrom(title: string): string {
  const words = title
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "TMPL";
  const initials = words.map((w) => w[0]).join("");
  // Single short word (e.g. "Roofing") yields one initial; use the word itself.
  const base = initials.length >= 2 ? initials : words[0];
  return base.slice(0, BASE_MAX) || "TMPL";
}

export function deriveTemplateCode(
  title: string,
  existing: Iterable<string>,
): string {
  const taken = new Set(Array.from(existing, (c) => c.toUpperCase()));
  const base = baseFrom(title);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const trimmed = base.slice(0, MAX - suffix.length);
    const candidate = `${trimmed}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/template-code.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/template-code.ts lib/template-code.test.ts
git commit -m "feat(templates): pure unique template-code derivation"
```

---

### Task 3: Pure helper — template property access

**Files:**
- Create: `lib/template-access.ts`
- Test: `lib/template-access.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type TemplateScopeRef = { allProperties: boolean; propertyIds: string[] }`
  - `templateAppliesToProperty(t: TemplateScopeRef, propertyId: string): boolean`
  - `canManageTemplate(role: Role, accessiblePropertyIds: string[], t: TemplateScopeRef): boolean`
  Tasks 4–6 consume these for filtering and authorization.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/template-access.test.ts
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { canManageTemplate, templateAppliesToProperty } from "./template-access";

const allProps = { allProperties: true, propertyIds: [] };
const llOnly = { allProperties: false, propertyIds: ["LL"] };
const llAndOr = { allProperties: false, propertyIds: ["LL", "OR"] };

describe("templateAppliesToProperty", () => {
  it("All-properties template applies everywhere", () => {
    expect(templateAppliesToProperty(allProps, "LL")).toBe(true);
    expect(templateAppliesToProperty(allProps, "OR")).toBe(true);
  });
  it("scoped template applies only to its listed properties", () => {
    expect(templateAppliesToProperty(llOnly, "LL")).toBe(true);
    expect(templateAppliesToProperty(llOnly, "OR")).toBe(false);
  });
});

describe("canManageTemplate", () => {
  it("ADMIN may manage anything", () => {
    expect(canManageTemplate(Role.ADMIN, ["LL"], allProps)).toBe(true);
    expect(canManageTemplate(Role.ADMIN, ["LL"], llAndOr)).toBe(true);
  });
  it("MANAGER may manage a template fully within their properties", () => {
    expect(canManageTemplate(Role.MANAGER, ["LL"], llOnly)).toBe(true);
    expect(canManageTemplate(Role.MANAGER, ["LL", "OR"], llAndOr)).toBe(true);
  });
  it("MANAGER may NOT manage a template touching a property they lack", () => {
    expect(canManageTemplate(Role.MANAGER, ["LL"], llAndOr)).toBe(false);
  });
  it("MANAGER may NOT manage an All-properties template", () => {
    expect(canManageTemplate(Role.MANAGER, ["LL"], allProps)).toBe(false);
  });
  it("MANAGER may NOT manage a template with no property association", () => {
    expect(
      canManageTemplate(Role.MANAGER, ["LL"], { allProperties: false, propertyIds: [] }),
    ).toBe(false);
  });
  it("CORPORATE is treated like MANAGER for the property-subset rule", () => {
    expect(canManageTemplate(Role.CORPORATE, ["LL", "OR"], llAndOr)).toBe(true);
    expect(canManageTemplate(Role.CORPORATE, ["LL"], allProps)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/template-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/template-access.ts
import { Role } from "@prisma/client";

// Property-scoped template rules (ADR-020). A template applies at a property if
// it is flagged all-properties or explicitly associated. Managers/corporate may
// only manage templates fully contained within their accessible properties and
// never all-properties (standardized) templates — those are ADMIN-governed.

export type TemplateScopeRef = { allProperties: boolean; propertyIds: string[] };

export function templateAppliesToProperty(
  t: TemplateScopeRef,
  propertyId: string,
): boolean {
  return t.allProperties || t.propertyIds.includes(propertyId);
}

export function canManageTemplate(
  role: Role,
  accessiblePropertyIds: string[],
  t: TemplateScopeRef,
): boolean {
  if (role === Role.ADMIN) return true;
  if (role !== Role.MANAGER && role !== Role.CORPORATE) return false;
  if (t.allProperties) return false;
  if (t.propertyIds.length === 0) return false;
  const allowed = new Set(accessiblePropertyIds);
  return t.propertyIds.every((id) => allowed.has(id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/template-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/template-access.ts lib/template-access.test.ts
git commit -m "feat(templates): pure property-scope + manage-authorization helpers"
```

---

### Task 4: Template CRUD server actions

**Files:**
- Create: `app/templates/actions.ts`
- (No unit test file — server actions hit Prisma; covered by the build + the pure helpers they call. Verify by typecheck + manual run in Task 5.)

**Interfaces:**
- Consumes: `deriveTemplateCode` (Task 2), `canManageTemplate` (Task 3), `requireManager`/`accessiblePropertyIds` (`lib/rbac.ts`), `db` (`lib/db.ts`).
- Produces:
  - `type QuestionInput = { type: QuestionType; prompt: string; required: boolean; photoMax?: number | null; failFlagsIssue?: boolean }`
  - `type TemplateInput = { name; defaultRole; scope; reviewLevel; allProperties; propertyIds: string[]; questions: QuestionInput[] }`
  - `createTemplate(input: unknown): Promise<ActionResult>`
  - `updateTemplate(id: string, input: unknown): Promise<ActionResult>`
  - `deleteTemplate(id: string): Promise<ActionResult>`
  - `type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string }`
  Task 5's builder calls all three.

- [ ] **Step 1: Write the actions module**

```typescript
// app/templates/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma, QuestionType, Role, ReviewLevel, TemplateScope } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { deriveTemplateCode } from "@/lib/template-code";
import { canManageTemplate } from "@/lib/template-access";

export type ActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string };

const questionSchema = z.object({
  type: z.nativeEnum(QuestionType),
  prompt: z.string().trim().min(1, "Each question needs a prompt"),
  required: z.boolean().default(true),
  photoMax: z.number().int().min(1).max(10).nullable().optional(),
  failFlagsIssue: z.boolean().default(false),
});

const templateSchema = z.object({
  name: z.string().trim().min(1, "Title is required"),
  defaultRole: z.nativeEnum(Role),
  scope: z.nativeEnum(TemplateScope),
  reviewLevel: z.nativeEnum(ReviewLevel).default(ReviewLevel.MANAGER),
  allProperties: z.boolean().default(false),
  propertyIds: z.array(z.string().uuid()).default([]),
  questions: z.array(questionSchema).min(1, "Add at least one question"),
});

async function writeAudit(
  actorUserId: string,
  entityId: string,
  action: string,
  after?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: { actorUserId, entityType: "template", entityId, action, after: after ?? undefined },
  });
}

// Authorization for the *requested* scope (create/update target state):
// ADMIN unrestricted; MANAGER/CORPORATE may only target a non-all-properties
// template fully within their accessible properties.
function assertCanTarget(
  role: Role,
  accessible: string[],
  allProperties: boolean,
  propertyIds: string[],
): string | null {
  if (canManageTemplate(role, accessible, { allProperties, propertyIds })) return null;
  if (role === Role.ADMIN) return null;
  return "Managers can only manage templates scoped to their own properties (not All-properties).";
}

export async function createTemplate(input: unknown): Promise<ActionResult> {
  const user = await requireManager();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, defaultRole, scope, reviewLevel, allProperties, propertyIds, questions } =
    parsed.data;

  if (!allProperties && propertyIds.length === 0) {
    return { ok: false, error: "Choose at least one property, or mark it All properties." };
  }
  const accessible = await accessiblePropertyIds(user);
  const denied = assertCanTarget(user.role, accessible, allProperties, propertyIds);
  if (denied) return { ok: false, error: denied };

  const existing = await db.checklistTemplate.findMany({ select: { code: true } });
  const code = deriveTemplateCode(name, existing.map((t) => t.code));

  const created = await db.$transaction(async (tx) => {
    const t = await tx.checklistTemplate.create({
      data: {
        code,
        name,
        defaultRole,
        scope,
        reviewLevel,
        allProperties,
        properties: allProperties
          ? undefined
          : { create: propertyIds.map((propertyId) => ({ propertyId })) },
        questions: {
          create: questions.map((q, i) => ({
            orderIndex: i,
            type: q.type,
            prompt: q.prompt,
            required: q.required,
            photoMax: q.type === QuestionType.PHOTO ? q.photoMax ?? 1 : null,
            failFlagsIssue: q.type === QuestionType.PASSFAIL ? q.failFlagsIssue : false,
          })),
        },
      },
      select: { id: true },
    });
    return t;
  });

  await writeAudit(user.id, created.id, "create", { name, code });
  revalidatePath("/templates");
  return { ok: true, id: created.id, message: `Created “${name}”.` };
}

export async function updateTemplate(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireManager();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, defaultRole, scope, reviewLevel, allProperties, propertyIds, questions } =
    parsed.data;
  if (!allProperties && propertyIds.length === 0) {
    return { ok: false, error: "Choose at least one property, or mark it All properties." };
  }

  const current = await db.checklistTemplate.findUnique({
    where: { id },
    select: { allProperties: true, properties: { select: { propertyId: true } } },
  });
  if (!current) return { ok: false, error: "Template not found." };

  const accessible = await accessiblePropertyIds(user);
  // Must be allowed to manage BOTH the current state and the requested state.
  const deniedCurrent = assertCanTarget(
    user.role,
    accessible,
    current.allProperties,
    current.properties.map((p) => p.propertyId),
  );
  const deniedNext = assertCanTarget(user.role, accessible, allProperties, propertyIds);
  if (deniedCurrent || deniedNext) {
    return { ok: false, error: deniedCurrent ?? deniedNext! };
  }

  await db.$transaction(async (tx) => {
    await tx.checklistTemplate.update({
      where: { id },
      data: { name, defaultRole, scope, reviewLevel, allProperties },
    });
    // Replace property associations.
    await tx.templateProperty.deleteMany({ where: { templateId: id } });
    if (!allProperties && propertyIds.length > 0) {
      await tx.templateProperty.createMany({
        data: propertyIds.map((propertyId) => ({ templateId: id, propertyId })),
      });
    }
    // Replace questions (simplest correct approach; instances keep their own
    // responses, which reference question ids — see note below).
    await tx.question.deleteMany({ where: { templateId: id } });
    await tx.question.createMany({
      data: questions.map((q, i) => ({
        templateId: id,
        orderIndex: i,
        type: q.type,
        prompt: q.prompt,
        required: q.required,
        photoMax: q.type === QuestionType.PHOTO ? q.photoMax ?? 1 : null,
        failFlagsIssue: q.type === QuestionType.PASSFAIL ? q.failFlagsIssue : false,
      })),
    });
  });

  await writeAudit(user.id, id, "update", { name });
  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
  return { ok: true, id, message: `Saved “${name}”.` };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const user = await requireManager();
  const t = await db.checklistTemplate.findUnique({
    where: { id },
    select: {
      name: true,
      allProperties: true,
      properties: { select: { propertyId: true } },
      _count: { select: { instances: true } },
    },
  });
  if (!t) return { ok: false, error: "Template not found." };

  const accessible = await accessiblePropertyIds(user);
  const denied = assertCanTarget(
    user.role,
    accessible,
    t.allProperties,
    t.properties.map((p) => p.propertyId),
  );
  if (denied) return { ok: false, error: denied };

  if (t._count.instances > 0) {
    return {
      ok: false,
      error: `Can’t delete — ${t._count.instances} checklist(s) use this template. Deactivate it instead.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.templateProperty.deleteMany({ where: { templateId: id } });
    await tx.question.deleteMany({ where: { templateId: id } });
    await tx.checklistTemplate.delete({ where: { id } });
  });

  await writeAudit(user.id, id, "delete", { name: t.name });
  revalidatePath("/templates");
  return { ok: true, message: `Deleted “${t.name}”.` };
}
```

> **Note on `updateTemplate` question replacement:** deleting + recreating questions is correct here because `Response.questionId` is a hard FK; an edit that removes a question while submitted responses reference it would violate the FK and the transaction will fail loudly. That is acceptable for v1 (templates are edited before they have submissions). If a later plan needs edit-with-history, switch to soft question versioning — out of scope here.

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors in `app/templates/actions.ts`. (Confirm `Response` FK assumption by reading `prisma/schema.prisma` `model Response` — if `questionId` is nullable/SetNull, the note above still holds; no code change needed.)

- [ ] **Step 3: Commit**

```bash
git add app/templates/actions.ts
git commit -m "feat(templates): create/update/delete server actions w/ RBAC scope + audit"
```

---

### Task 5: Template list + builder UI

**Files:**
- Create: `app/templates/page.tsx`, `app/templates/TemplatesClient.tsx`, `app/templates/TemplateBuilder.tsx`, `app/templates/new/page.tsx`, `app/templates/[id]/page.tsx`
- Modify: `app/admin/templates/page.tsx` (redirect to `/templates`)

**Interfaces:**
- Consumes: actions from Task 4; `requireManager`, `accessiblePropertyIds`, `accessibleProperties` (`lib/rbac.ts`); `getCurrentPropertyId` (`lib/current-property.ts`); `resolveScopedPropertyIds` (`lib/property-scope.ts`); `templateAppliesToProperty`, `canManageTemplate` (Task 3); `PageHeader` (`components/shell/PageHeader.tsx`).
- Produces: the `/templates` surface. No types consumed downstream except routes.

- [ ] **Step 1: Build the list page (server component)**

```tsx
// app/templates/page.tsx
import Link from "next/link";
import { requireManager, accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { templateAppliesToProperty, canManageTemplate } from "@/lib/template-access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { TemplatesClient } from "./TemplatesClient";

export default async function TemplatesPage() {
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopedIds = resolveScopedPropertyIds(accessible, activeId);

  const templates = await db.checklistTemplate.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      scope: true,
      defaultRole: true,
      reviewLevel: true,
      allProperties: true,
      properties: { select: { propertyId: true } },
      _count: { select: { questions: true, instances: true } },
    },
  });

  const scopedSet = new Set(scopedIds);
  const rows = templates
    .map((t) => {
      const propertyIds = t.properties.map((p) => p.propertyId);
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        scope: t.scope,
        allProperties: t.allProperties,
        propertyIds,
        questionCount: t._count.questions,
        instanceCount: t._count.instances,
        canManage: canManageTemplate(user.role, accessible, { allProperties: t.allProperties, propertyIds }),
        appliesHere: propertyIds.some((id) => scopedSet.has(id)) || t.allProperties,
      };
    })
    // Show templates that apply to the active scope (All-properties always show).
    .filter((t) => activeId == null || t.appliesHere);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Checklist templates"
        subtitle={`${rows.length} template${rows.length === 1 ? "" : "s"} for the current scope`}
        actions={
          <Link
            href="/templates/new"
            className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            New template
          </Link>
        }
      />
      <TemplatesClient rows={rows} />
    </div>
  );
}
```

- [ ] **Step 2: Build the list client (renders rows + delete)**

```tsx
// app/templates/TemplatesClient.tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTemplate } from "./actions";

type Row = {
  id: string;
  code: string;
  name: string;
  scope: string;
  allProperties: boolean;
  propertyIds: string[];
  questionCount: number;
  instanceCount: number;
  canManage: boolean;
};

export function TemplatesClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function onDelete(id: string, name: string) {
    if (!confirm(`Delete “${name}”? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteTemplate(id);
      setBanner(res.ok ? { kind: "ok", text: res.message ?? "Deleted." } : { kind: "err", text: res.error });
      if (res.ok) router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
        <p className="text-sm text-slate-600">No templates for this property yet.</p>
        <Link
          href="/templates/new"
          className="mt-3 inline-block rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
        >
          Create a checklist template
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {banner && (
        <div className={`rounded-md p-2 text-sm ${banner.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {banner.text}
        </div>
      )}
      {rows.map((t) => (
        <div key={t.id} className="flex items-center justify-between rounded-lg bg-white p-4 ring-1 ring-slate-200 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{t.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t.code}</span>
              {t.allProperties && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">All properties</span>}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {t.questionCount} question{t.questionCount === 1 ? "" : "s"} · {t.scope} · {t.instanceCount} checklist{t.instanceCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {t.canManage ? (
              <Link href={`/templates/${t.id}`} className="rounded-md px-3 py-1.5 text-sm font-medium text-navy ring-1 ring-slate-300 hover:bg-slate-50">
                Edit
              </Link>
            ) : (
              <span className="text-xs text-slate-400">View only</span>
            )}
            {t.canManage && (
              <button
                onClick={() => onDelete(t.id, t.name)}
                disabled={pending}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build the builder client (fields + properties + question editor)**

```tsx
// app/templates/TemplateBuilder.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuestionType, Role, ReviewLevel, TemplateScope } from "@prisma/client";
import { createTemplate, updateTemplate } from "./actions";

export type BuilderProperty = { id: string; shortCode: string; name: string };
export type BuilderQuestion = {
  type: QuestionType;
  prompt: string;
  required: boolean;
  photoMax?: number | null;
  failFlagsIssue?: boolean;
};
export type BuilderInitial = {
  id?: string;
  name: string;
  defaultRole: Role;
  scope: TemplateScope;
  reviewLevel: ReviewLevel;
  allProperties: boolean;
  propertyIds: string[];
  questions: BuilderQuestion[];
};

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: QuestionType.SHORT_TEXT, label: "Single line text" },
  { value: QuestionType.LONG_TEXT, label: "Multi line text" },
  { value: QuestionType.SINGLE, label: "Radio (one)" },
  { value: QuestionType.MULTI, label: "Checkbox (multiple)" },
  { value: QuestionType.YESNO, label: "Yes / No" },
  { value: QuestionType.PASSFAIL, label: "Pass / Fail" },
  { value: QuestionType.NUMBER, label: "Number" },
  { value: QuestionType.DATE, label: "Date" },
  { value: QuestionType.PHOTO, label: "Upload photo" },
  { value: QuestionType.SIGNATURE, label: "Signature" },
  { value: QuestionType.SECTION_DIVIDER, label: "Section divider" },
];

export function TemplateBuilder({
  initial,
  properties,
  canUseAllProperties,
}: {
  initial: BuilderInitial;
  properties: BuilderProperty[];
  canUseAllProperties: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial.name);
  const [defaultRole, setDefaultRole] = useState(initial.defaultRole);
  const [scope, setScope] = useState(initial.scope);
  const [reviewLevel, setReviewLevel] = useState(initial.reviewLevel);
  const [allProperties, setAllProperties] = useState(initial.allProperties);
  const [propertyIds, setPropertyIds] = useState<string[]>(initial.propertyIds);
  const [questions, setQuestions] = useState<BuilderQuestion[]>(initial.questions);

  function toggleProperty(id: string) {
    setPropertyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function addQuestion() {
    setQuestions((q) => [...q, { type: QuestionType.SHORT_TEXT, prompt: "", required: true }]);
  }
  function updateQuestion(i: number, patch: Partial<BuilderQuestion>) {
    setQuestions((q) => q.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    setQuestions((q) => {
      const j = i + dir;
      if (j < 0 || j >= q.length) return q;
      const copy = [...q];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function save() {
    setError(null);
    const payload = {
      name,
      defaultRole,
      scope,
      reviewLevel,
      allProperties,
      propertyIds: allProperties ? [] : propertyIds,
      questions,
    };
    startTransition(async () => {
      const res = initial.id
        ? await updateTemplate(initial.id, payload)
        : await createTemplate(payload);
      if (res.ok) {
        router.push("/templates");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>}

      <section className="flex flex-col gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200">
        <label className="text-sm font-medium text-slate-700">Title
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Pool Safety Check" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-700">Default role
            <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as Role)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.values(Role).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Scope
            <select value={scope} onChange={(e) => setScope(e.target.value as TemplateScope)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.values(TemplateScope).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Review level
            <select value={reviewLevel} onChange={(e) => setReviewLevel(e.target.value as ReviewLevel)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.values(ReviewLevel).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-slate-800">Available at properties</p>
        {canUseAllProperties && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allProperties} onChange={(e) => setAllProperties(e.target.checked)} />
            All properties
          </label>
        )}
        {!allProperties && (
          <div className="flex flex-wrap gap-2">
            {properties.map((p) => (
              <label key={p.id} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ring-1 ${propertyIds.includes(p.id) ? "bg-sky-50 ring-sky-300" : "ring-slate-300"}`}>
                <input type="checkbox" checked={propertyIds.includes(p.id)} onChange={() => toggleProperty(p.id)} />
                {p.shortCode}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Questions</p>
          <button onClick={addQuestion} className="rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200">+ Add question</button>
        </div>
        {questions.map((q, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{i + 1}</span>
              <select value={q.type} onChange={(e) => updateQuestion(i, { type: e.target.value as QuestionType })}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => move(i, -1)} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">↑</button>
                <button onClick={() => move(i, 1)} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">↓</button>
                <button onClick={() => removeQuestion(i)} className="rounded px-2 py-1 text-sm text-red-500 hover:bg-red-50">✕</button>
              </div>
            </div>
            <input value={q.prompt} onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
              placeholder="Question prompt" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <div className="flex items-center gap-4">
              {q.type !== QuestionType.SECTION_DIVIDER && (
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} /> Required
                </label>
              )}
              {q.type === QuestionType.PHOTO && (
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  Max photos
                  <input type="number" min={1} max={10} value={q.photoMax ?? 1}
                    onChange={(e) => updateQuestion(i, { photoMax: Number(e.target.value) })}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                </label>
              )}
              {q.type === QuestionType.PASSFAIL && (
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={q.failFlagsIssue ?? false} onChange={(e) => updateQuestion(i, { failFlagsIssue: e.target.checked })} /> Fail raises an issue
                </label>
              )}
            </div>
          </div>
        ))}
      </section>

      <div className="flex gap-2">
        <button onClick={save} disabled={pending}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {pending ? "Saving…" : initial.id ? "Save template" : "Create template"}
        </button>
        <button onClick={() => router.push("/templates")} className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300">Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build the `new` and `[id]` pages**

```tsx
// app/templates/new/page.tsx
import { Role, ReviewLevel, TemplateScope, QuestionType } from "@prisma/client";
import { requireManager, accessibleProperties } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { TemplateBuilder } from "../TemplateBuilder";

export default async function NewTemplatePage() {
  const user = await requireManager();
  const properties = await accessibleProperties(user);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New template" subtitle="Define fields and where it applies" />
      <TemplateBuilder
        canUseAllProperties={user.role === Role.ADMIN}
        properties={properties}
        initial={{
          name: "",
          defaultRole: Role.HK,
          scope: TemplateScope.PER_ROOM,
          reviewLevel: ReviewLevel.MANAGER,
          allProperties: false,
          propertyIds: [],
          questions: [{ type: QuestionType.SHORT_TEXT, prompt: "", required: true }],
        }}
      />
    </div>
  );
}
```

```tsx
// app/templates/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireManager, accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { canManageTemplate } from "@/lib/template-access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { TemplateBuilder } from "../TemplateBuilder";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const properties = await accessibleProperties(user);

  const t = await db.checklistTemplate.findUnique({
    where: { id },
    select: {
      id: true, name: true, defaultRole: true, scope: true, reviewLevel: true, allProperties: true,
      properties: { select: { propertyId: true } },
      questions: {
        orderBy: { orderIndex: "asc" },
        select: { type: true, prompt: true, required: true, photoMax: true, failFlagsIssue: true },
      },
    },
  });
  if (!t) notFound();

  const propertyIds = t.properties.map((p) => p.propertyId);
  if (!canManageTemplate(user.role, accessible, { allProperties: t.allProperties, propertyIds })) {
    redirect("/templates");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Edit ${t.name}`} />
      <TemplateBuilder
        canUseAllProperties={user.role === Role.ADMIN}
        properties={properties}
        initial={{
          id: t.id, name: t.name, defaultRole: t.defaultRole, scope: t.scope, reviewLevel: t.reviewLevel,
          allProperties: t.allProperties, propertyIds,
          questions: t.questions.map((q) => ({
            type: q.type, prompt: q.prompt, required: q.required, photoMax: q.photoMax, failFlagsIssue: q.failFlagsIssue,
          })),
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Redirect the old admin route**

Replace the body of `app/admin/templates/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function AdminTemplatesRedirect() {
  redirect("/templates");
}
```

- [ ] **Step 6: Typecheck + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: clean types; build succeeds with the new `/templates`, `/templates/new`, `/templates/[id]` routes listed.

- [ ] **Step 7: Commit**

```bash
git add app/templates app/admin/templates/page.tsx
git commit -m "feat(templates): editable builder + property-scoped list at /templates (ADR-020)"
```

---

### Task 6: Manual create — `/checklists/new`

**Files:**
- Create: `lib/manual-create.ts`, `lib/manual-create.test.ts`, `app/checklists/new/page.tsx`, `app/checklists/new/actions.ts`, `app/checklists/new/ManualCreateClient.tsx`

**Interfaces:**
- Consumes: `buildSystemId` (`lib/recurrence.ts`), `etYYYYMMDD`/`etDateOnly`/`formatInET` (`lib/datetime.ts`), `requireManager`/`canAccessProperty`/`accessiblePropertyIds` (`lib/rbac.ts`), `templateAppliesToProperty` (Task 3), `db`.
- Produces: `nextManualLabelDefault(templateName: string, date: Date): string`; `createInstanceManually(input: unknown): Promise<ActionResult>`.

- [ ] **Step 1: Write the failing test for the label default**

```typescript
// lib/manual-create.test.ts
import { describe, expect, it } from "vitest";
import { nextManualLabelDefault } from "./manual-create";

describe("nextManualLabelDefault", () => {
  it("formats '{name} — {Mon D, YYYY}' in ET", () => {
    // 2026-06-24 12:00 UTC is still Jun 24 in ET
    const d = new Date("2026-06-24T12:00:00.000Z");
    expect(nextManualLabelDefault("Pool Safety Check", d)).toBe("Pool Safety Check — Jun 24, 2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/manual-create.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the label default**

```typescript
// lib/manual-create.ts
import { formatInET } from "@/lib/datetime";

// Default title for a manually-created instance: "{template} — {Mon D, YYYY}" (ET).
export function nextManualLabelDefault(templateName: string, date: Date): string {
  return `${templateName} — ${formatInET(date, "MMM d, yyyy")}`;
}
```

> Confirm `formatInET(date, pattern)` exists with this signature in `lib/datetime.ts` (the Explore map cites `formatInET(dt, pattern)`). If the pattern token differs, adjust to produce `Jun 24, 2026`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/manual-create.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the manual-create server action**

```typescript
// app/checklists/new/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { InstanceStatus, TemplateScope, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager, canAccessProperty } from "@/lib/rbac";
import { buildSystemId } from "@/lib/recurrence";
import { etDateOnly, etYYYYMMDD } from "@/lib/datetime";

export type ActionResult =
  | { ok: true; id: string; message?: string }
  | { ok: false; error: string };

const schema = z.object({
  templateId: z.string().uuid(),
  propertyId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Title is required"),
});

export async function createInstanceManually(input: unknown): Promise<ActionResult> {
  const user = await requireManager();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { templateId, propertyId, roomId, assignedUserId, title } = parsed.data;

  if (!(await canAccessProperty(user, propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }

  const template = await db.checklistTemplate.findUnique({
    where: { id: templateId },
    select: { code: true, scope: true, active: true, allProperties: true, properties: { select: { propertyId: true } } },
  });
  if (!template || !template.active) return { ok: false, error: "Template not found." };

  const applies = template.allProperties || template.properties.some((p) => p.propertyId === propertyId);
  if (!applies) return { ok: false, error: "That template isn't available at this property." };

  if (template.scope === TemplateScope.PER_ROOM && !roomId) {
    return { ok: false, error: "This checklist is per-room — choose a room." };
  }
  const effectiveRoomId = template.scope === TemplateScope.PER_ROOM ? (roomId ?? null) : null;

  const property = await db.property.findUnique({ where: { id: propertyId }, select: { propertyId: true } });
  if (!property) return { ok: false, error: "Property not found." };

  const target = etDateOnly();
  const ymd = etYYYYMMDD(target);

  // ADR-009 seq: per (property, template, ET day), restart at 001, continue
  // past pre-existing instances — same rule as generateForDate().
  const existingCount = await db.checklistInstance.count({
    where: { propertyId, templateId, scheduledFor: target },
  });
  const seq = existingCount + 1;

  const created = await db.checklistInstance.create({
    data: {
      systemId: buildSystemId(property.propertyId, template.code, ymd, seq),
      title,
      templateId,
      propertyId,
      roomId: effectiveRoomId,
      scheduledFor: target,
      assignedUserId: assignedUserId ?? null,
      status: assignedUserId ? InstanceStatus.ASSIGNED : InstanceStatus.SCHEDULED,
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      actorUserId: user.id,
      entityType: "checklist_instance",
      entityId: created.id,
      action: "create_manual",
      after: { title, templateId, propertyId } as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/");
  revalidatePath("/review");
  return { ok: true, id: created.id, message: `Created “${title}”.` };
}
```

> **Race note:** the seq is computed then written non-transactionally, matching `generateForDate`. For the manual single-create path a collision requires two managers creating the same template at the same property in the same second; `systemId` is `@unique`, so a collision throws rather than corrupts. Acceptable for v1; if it ever bites, wrap count+create in a serializable transaction.

- [ ] **Step 6: Build the manual-create client form**

```tsx
// app/checklists/new/ManualCreateClient.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInstanceManually } from "./actions";

type TemplateOpt = { id: string; name: string; scope: string };
type RoomOpt = { id: string; roomNumber: string };
type UserOpt = { id: string; name: string };

export function ManualCreateClient({
  templates,
  rooms,
  assignees,
  activePropertyId,
  defaultTitleFor,
}: {
  templates: TemplateOpt[];
  rooms: RoomOpt[];
  assignees: UserOpt[];
  activePropertyId: string | null;
  defaultTitleFor: Record<string, string>; // templateId -> default title
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState(templates[0] ? defaultTitleFor[templates[0].id] : "");
  const [roomId, setRoomId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");

  const selected = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);
  const perRoom = selected?.scope === "PER_ROOM";

  function onTemplateChange(id: string) {
    setTemplateId(id);
    setTitle(defaultTitleFor[id] ?? "");
  }

  function submit() {
    setError(null);
    if (!activePropertyId) {
      setError("Select a single property in the header first.");
      return;
    }
    startTransition(async () => {
      const res = await createInstanceManually({
        templateId,
        propertyId: activePropertyId,
        roomId: perRoom ? roomId || null : null,
        assignedUserId: assignedUserId || null,
        title,
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
        <p className="text-sm text-slate-600">No templates available for this property.</p>
        <a href="/templates/new" className="mt-3 inline-block rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white">
          Create a checklist template first
        </a>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>}
      <label className="text-sm font-medium text-slate-700">Template
        <select value={templateId} onChange={(e) => onTemplateChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Title
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </label>
      {perRoom && (
        <label className="text-sm font-medium text-slate-700">Room
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select a room…</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.roomNumber}</option>)}
          </select>
        </label>
      )}
      <label className="text-sm font-medium text-slate-700">Assign to (optional)
        <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Unassigned</option>
          {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <button onClick={submit} disabled={pending}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {pending ? "Creating…" : "Create now"}
        </button>
        <a href="/templates" className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300">Edit a template instead</a>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Build the manual-create page (server)**

```tsx
// app/checklists/new/page.tsx
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { db } from "@/lib/db";
import { etDateOnly } from "@/lib/datetime";
import { nextManualLabelDefault } from "@/lib/manual-create";
import { PageHeader } from "@/components/shell/PageHeader";
import { ManualCreateClient } from "./ManualCreateClient";

export default async function NewChecklistPage() {
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activePropertyId = await getCurrentPropertyId(accessible);

  // Templates available at the active property (All-properties or associated).
  const allTemplates = await db.checklistTemplate.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, scope: true, allProperties: true, properties: { select: { propertyId: true } } },
  });
  const templates = allTemplates.filter(
    (t) => t.allProperties || (activePropertyId != null && t.properties.some((p) => p.propertyId === activePropertyId)),
  );

  const today = etDateOnly();
  const defaultTitleFor: Record<string, string> = {};
  for (const t of templates) defaultTitleFor[t.id] = nextManualLabelDefault(t.name, today);

  const [rooms, assignees] = activePropertyId
    ? await Promise.all([
        db.room.findMany({ where: { propertyId: activePropertyId }, orderBy: { roomNumber: "asc" }, select: { id: true, roomNumber: true } }),
        db.user.findMany({
          where: { active: true, properties: { some: { propertyId: activePropertyId } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Create a checklist" subtitle="Creates one checklist immediately" />
      <ManualCreateClient
        templates={templates.map((t) => ({ id: t.id, name: t.name, scope: t.scope }))}
        rooms={rooms}
        assignees={assignees}
        activePropertyId={activePropertyId}
        defaultTitleFor={defaultTitleFor}
      />
    </div>
  );
}
```

> Verify `db.user` has an `active` field and the `properties` relation name matches the schema (`UserProperty`). The Explore map shows users link to properties via `user_properties`; adjust the `where` relation key if Prisma names it `properties`.

- [ ] **Step 8: Typecheck + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: clean; `/checklists/new` route listed.

- [ ] **Step 9: Commit**

```bash
git add lib/manual-create.ts lib/manual-create.test.ts app/checklists/new
git commit -m "feat(checklists): manual immediate create at /checklists/new (ADR-009 seq, ADR-020 scope)"
```

---

### Task 7: Nav wiring, shell exception, label fallback

**Files:**
- Modify: `lib/nav.ts`, `lib/nav.test.ts`
- Verify: instance label rendering uses `instance.title` when present (Today/review surfaces) — minimal change.

**Interfaces:**
- Consumes: nothing new.
- Produces: `Templates` in MAIN_MANAGER; `shouldHideShell("/checklists/new") === false`.

- [ ] **Step 1: Write/extend the failing nav test**

Add to `lib/nav.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { navItemsForRole, shouldHideShell } from "./nav";

describe("nav — templates entry", () => {
  it("MANAGER sees Templates", () => {
    expect(navItemsForRole(Role.MANAGER).some((n) => n.href === "/templates")).toBe(true);
  });
  it("ADMIN no longer points at /admin/templates", () => {
    expect(navItemsForRole(Role.ADMIN).some((n) => n.href === "/admin/templates")).toBe(false);
    expect(navItemsForRole(Role.ADMIN).some((n) => n.href === "/templates")).toBe(true);
  });
  it("field staff do NOT see Templates", () => {
    expect(navItemsForRole(Role.HK).some((n) => n.href === "/templates")).toBe(false);
  });
});

describe("nav — shell visibility for manual create", () => {
  it("hides shell on the fill runtime", () => {
    expect(shouldHideShell("/checklists/abc-123")).toBe(true);
  });
  it("SHOWS shell on manual create", () => {
    expect(shouldHideShell("/checklists/new")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/nav.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Update `lib/nav.ts`**

Replace `MAIN_MANAGER` and the admin group, and refine `shouldHideShell`:

```typescript
const MAIN_MANAGER: NavItem[] = [
  { href: "/", label: "Today", group: "main" },
  { href: "/review", label: "Review", group: "main" },
  { href: "/issues", label: "Issues", group: "main" },
  { href: "/rules", label: "Rules", group: "main" },
  { href: "/templates", label: "Templates", group: "main" },
];

const ADMIN_GROUP: NavItem[] = [
  { href: "/admin/users", label: "Users", group: "admin" },
  { href: "/admin/sla", label: "SLA", group: "admin" },
  { href: "/admin/properties", label: "Properties", group: "admin" },
];
```

And update the hide logic so the in-shell manual-create page is exempt while the bare fill runtime stays hidden:

```typescript
export function shouldHideShell(pathname: string): boolean {
  // Manual create lives under /checklists but is a manager form inside the shell.
  if (pathname === "/checklists/new") return false;
  return SHELL_HIDE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Make instance labels prefer `title`**

Find where Today/review render an instance's human label (search for `buildHumanLabel(` usages). At each call site that renders a single instance label for display, prefer the stored title:

```typescript
const label = instance.title ?? buildHumanLabel({ /* existing args */ });
```

Run: `pnpm exec grep -rn "buildHumanLabel(" app lib` (or use the editor search) to find call sites, and apply the `instance.title ??` fallback only where an instance with a `title` field is in scope. If no display call site currently selects `title`, add `title: true` to that query's `select`.

- [ ] **Step 6: Full verification**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run && pnpm build`
Expected: clean types, clean lint, all tests pass (prior count + new template-code/template-access/manual-create/nav cases), build lists `/templates`, `/templates/new`, `/templates/[id]`, `/checklists/new`.

- [ ] **Step 7: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts app lib
git commit -m "feat(nav): Templates in manager nav; shell on /checklists/new; instance title fallback"
```

---

## Self-Review

**Spec coverage (spec §6a–6c + §3.5 template-scope + §9 ADR-020):**
- §6a Template Builder (ADMIN+MANAGER, fields, Available-at-properties, questions w/ type+required, code derivation) → Tasks 2,4,5. ✓
- §6a property association (`template_properties` + All-properties) → Task 1 schema + Tasks 4,5. ✓
- §6a question types mapped to `QuestionType` → Task 5 `QUESTION_TYPES`. ✓
- §6a auto start/complete are metadata, not questions → not added as questions (start = `openedAt` in Plan 4, complete = `submittedAt`). ✓ (display is Plan 4)
- §6b Manual create immediate, title override required, fork link, empty state → Task 6. ✓
- §6b "Edit the template instead" link → Task 6 client. ✓
- §6b empty state (0 templates) → Task 6 client + Task 5 list. ✓
- §3.5 active property drives template list + manual-create options → Tasks 5,6 use `getCurrentPropertyId` + `resolveScopedPropertyIds`. ✓
- §6c auto-create unchanged → untouched. ✓

**Out of this plan (correctly deferred):** OTP/auth (Plan 2), completed view/home revamp/mark-opened/photo metadata (Plan 4), dashboard/reports/PDF (Plan 5), recurrence polish (Plan 6), placeholder hard-delete (Plan 7).

**Placeholder scan:** no TBD/TODO; every code step has complete code. Two explicit *verification* asks (not placeholders): confirm `formatInET` token (Task 6 Step 3) and the user→property relation key (Task 6 Step 7) against the actual schema during execution.

**Type consistency:** `TemplateScopeRef` ({allProperties, propertyIds}) used identically in Tasks 3,4,5,6; `ActionResult` shape consistent within each actions file; `deriveTemplateCode(title, existing)` signature matches its one call site (Task 4); `buildSystemId(propertyCode, templateCode, ymd, seq)` call in Task 6 matches `lib/recurrence.ts`.

**Known risk flagged for Kate:** manager edit/delete scope (Decision 2) is conservative — managers cannot edit All-properties or cross-property templates. Confirm before Plan 3 merge.
