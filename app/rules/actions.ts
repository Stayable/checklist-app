"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role, TemplateScope } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import { autoGenerateBlockedReason } from "@/lib/recurrence";
import { generateForDate } from "@/lib/recurrence.server";
import { DUE_TIME_PATTERN } from "@/lib/due-time";

// Recurring-rule mutations (ADR-009). Manager can manage rules at their own
// property; CORPORATE/ADMIN across all. Every mutation writes to audit_log.

export type RuleResult = { ok: true; message?: string } | { ok: false; error: string };

const patternSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({
    type: z.literal("weekly"),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day"),
  }),
  z.object({ type: z.literal("monthly"), dayOfMonth: z.number().int().min(1).max(31) }),
  z.object({ type: z.literal("quarterly"), dayOfMonth: z.number().int().min(1).max(31) }),
  z.object({ type: z.literal("on-demand") }),
]);

const scopeSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("all") }),
    z.object({ kind: z.literal("occupied") }),
    z.object({ kind: z.literal("vacant") }),
    z.object({ kind: z.literal("list"), roomNumbers: z.array(z.string().min(1)).min(1) }),
    z.object({ kind: z.literal("range"), from: z.string().min(1), to: z.string().min(1) }),
  ])
  .nullable();

const assignmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: z.string().uuid() }),
  z.object({ type: z.literal("role"), role: z.nativeEnum(Role) }),
  z.object({ type: z.literal("unassigned") }),
]);

const ymd = /^\d{8}$/;

/**
 * ET wall-clock `HH:mm`, or null for no deadline.
 *
 * Same regex the batch wizard validates against (lib/due-time.ts says why they
 * are shared): both paths write `checklist_instances.due_at`, and the reminder
 * cron reads that one column without knowing which of them produced the row.
 */
const dueTimeSchema = z.string().regex(DUE_TIME_PATTERN, "Use HH:mm, 24-hour").nullable();

const createSchema = z.object({
  templateId: z.string().uuid(),
  propertyId: z.string().uuid(),
  pattern: patternSchema,
  scope: scopeSchema.optional(),
  assignment: assignmentSchema,
  dueTime: dueTimeSchema.optional(),
  effectiveFrom: z.string().regex(ymd).optional().nullable(),
  effectiveTo: z.string().regex(ymd).optional().nullable(),
  active: z.boolean().default(true),
});

function ymdToDate(s: string): Date {
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00.000Z`);
}

export async function createRule(input: unknown): Promise<RuleResult> {
  const user = await requireManager();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  if (!(await canAccessProperty(user, data.propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }
  const template = await db.checklistTemplate.findUnique({
    where: { id: data.templateId },
    select: { id: true, scope: true, copies: true, active: true },
  });
  if (!template || !template.active) return { ok: false, error: "Template not found." };

  // Some templates cannot be generated unattended at all — the 5 AM cron
  // resolves targets from `scope` and has no way to learn who is on shift or
  // what today's tasks are. Refusing here is the point: without it a rule is
  // accepted, fires every morning, and produces one unassigned property-wide
  // instance that looks like the work was scheduled when it was not.
  const blocked = autoGenerateBlockedReason(template.copies);
  if (blocked) return { ok: false, error: blocked };

  // Scope only applies to PER_ROOM templates; ignore (store null) otherwise.
  const scope = template.scope === TemplateScope.PER_ROOM ? (data.scope ?? null) : null;

  const rule = await db.$transaction(async (tx) => {
    const created = await tx.recurringRule.create({
      data: {
        templateId: data.templateId,
        propertyId: data.propertyId,
        pattern: data.pattern,
        assignment: data.assignment,
        scope: scope ?? undefined,
        dueTime: data.dueTime ?? null,
        effectiveFrom: data.effectiveFrom ? ymdToDate(data.effectiveFrom) : null,
        effectiveTo: data.effectiveTo ? ymdToDate(data.effectiveTo) : null,
        active: data.active,
        createdByUserId: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "recurring_rule",
        entityId: created.id,
        action: "create",
        after: {
          templateId: data.templateId,
          propertyId: data.propertyId,
          pattern: data.pattern,
          assignment: data.assignment,
          scope,
          // Recorded like every other rule field: the due time decides when a
          // checklist starts counting as late and who gets reminded, so "who
          // set 6 AM on this rule" is a question that will get asked.
          dueTime: data.dueTime ?? null,
        },
      },
    });
    return created;
  });

  revalidatePath("/rules");
  return { ok: true, message: `Rule created (${rule.id.slice(0, 8)}).` };
}

type LoadedRule =
  | { ok: false; error: string }
  | {
      ok: true;
      rule: { id: string; propertyId: string; active: boolean; dueTime: string | null };
    };

async function loadRuleForMutation(
  ruleId: string,
  user: Awaited<ReturnType<typeof requireManager>>,
): Promise<LoadedRule> {
  const rule = await db.recurringRule.findUnique({
    where: { id: ruleId },
    select: { id: true, propertyId: true, active: true, dueTime: true },
  });
  if (!rule) return { ok: false, error: "Rule not found." };
  if (!(await canAccessProperty(user, rule.propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }
  return { ok: true, rule };
}

export async function setRuleActive(ruleId: string, active: boolean): Promise<RuleResult> {
  const user = await requireManager();
  const loaded = await loadRuleForMutation(ruleId, user);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  await db.$transaction(async (tx) => {
    await tx.recurringRule.update({ where: { id: ruleId }, data: { active } });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "recurring_rule",
        entityId: ruleId,
        action: active ? "activate" : "pause",
        before: { active: loaded.rule.active },
        after: { active },
      },
    });
  });

  revalidatePath("/rules");
  return { ok: true, message: active ? "Rule activated." : "Rule paused." };
}

/**
 * Change (or clear) a live rule's due time.
 *
 * The only rule field that is editable in place. Everything else — template,
 * property, pattern, scope — changes what the rule MEANS, and /rules has always
 * answered that with delete-and-recreate. A deadline is different: it is the
 * one field a manager gets wrong and needs to fix without throwing away the
 * schedule, and before it existed there was nothing to get wrong.
 *
 * Only instances generated AFTER this lands are affected. Rewriting `due_at` on
 * checklists that already exist would move a deadline out from under someone
 * mid-shift, and would silently un-remind rows the reminder cron has already
 * stamped.
 */
export async function setRuleDueTime(
  ruleId: string,
  dueTime: string | null,
): Promise<RuleResult> {
  const user = await requireManager();
  const parsed = dueTimeSchema.safeParse(dueTime);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid due time" };
  }
  const loaded = await loadRuleForMutation(ruleId, user);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const next = parsed.data;
  await db.$transaction(async (tx) => {
    await tx.recurringRule.update({ where: { id: ruleId }, data: { dueTime: next } });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "recurring_rule",
        entityId: ruleId,
        action: "set_due_time",
        before: { dueTime: loaded.rule.dueTime },
        after: { dueTime: next },
      },
    });
  });

  revalidatePath("/rules");
  return {
    ok: true,
    message: next
      ? `Due time set to ${next} ET for checklists created from now on.`
      : "Due time cleared — no deadline, no reminders.",
  };
}

export async function deleteRule(ruleId: string): Promise<RuleResult> {
  const user = await requireManager();
  const loaded = await loadRuleForMutation(ruleId, user);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  await db.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "recurring_rule",
        entityId: ruleId,
        action: "delete",
        before: { active: loaded.rule.active },
      },
    });
    await tx.recurringRule.delete({ where: { id: ruleId } });
  });

  revalidatePath("/rules");
  return { ok: true, message: "Rule deleted." };
}

/** ADR-009 override: force-create today's instances from a single rule, even if paused. */
export async function forceCreateToday(ruleId: string): Promise<RuleResult> {
  const user = await requireManager();
  const loaded = await loadRuleForMutation(ruleId, user);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const res = await generateForDate(undefined, { ruleIds: [ruleId], force: true });
  if (res.errors.length) return { ok: false, error: res.errors[0].message };

  await db.auditLog.create({
    data: {
      actorUserId: user.id,
      entityType: "recurring_rule",
      entityId: ruleId,
      action: "force_create",
      after: { created: res.instancesCreated, skipped: res.instancesSkipped, date: res.date },
    },
  });

  revalidatePath("/rules");
  revalidatePath("/");
  return {
    ok: true,
    message: `Created ${res.instancesCreated} (${res.instancesSkipped} already existed).`,
  };
}
