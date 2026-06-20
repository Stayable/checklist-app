import { InstanceStatus, TemplateScope } from "@prisma/client";
import { db } from "@/lib/db";
import { etDateOnly, etYYYYMMDD } from "@/lib/datetime";
import {
  buildSystemId,
  expandRooms,
  shouldGenerateOn,
  type RecurrencePattern,
  type RoomFilter,
} from "@/lib/recurrence";

// Server-side auto-generation (ADR-009). Called by the 5:00 AM ET Vercel Cron
// and by manual "force-create today" / bulk paths. Idempotent per
// (template, property, room, date): re-running a day never duplicates.

export type GenerateResult = {
  date: string; // yyyyMMdd (ET)
  rulesEvaluated: number;
  rulesFired: number;
  instancesCreated: number;
  instancesSkipped: number; // already existed
  errors: { ruleId: string; message: string }[];
};

type RuleAssignment = { type: "user" | "role" | "unassigned"; userId?: string; role?: string };

export type GenerateOptions = {
  // Restrict to specific rules (used by "force-create today" from one rule).
  ruleIds?: string[];
  // Include paused rules and bypass the pattern check — for an explicit manual
  // force-create from a paused/non-firing rule (ADR-009 override path).
  force?: boolean;
};

/**
 * Generate checklist instances for every active rule that fires on `target`
 * (an ET calendar date as a UTC-midnight Date; defaults to today ET).
 */
export async function generateForDate(
  target: Date = etDateOnly(),
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const ymd = etYYYYMMDD(target);
  const result: GenerateResult = {
    date: ymd,
    rulesEvaluated: 0,
    rulesFired: 0,
    instancesCreated: 0,
    instancesSkipped: 0,
    errors: [],
  };

  const rules = await db.recurringRule.findMany({
    where: {
      // A forced single-rule run still requires the rule itself; the active
      // gate is lifted only when force is set.
      active: opts.force ? undefined : true,
      template: { active: true },
      property: { active: true },
      ...(opts.ruleIds ? { id: { in: opts.ruleIds } } : {}),
    },
    include: { template: true, property: true },
  });
  result.rulesEvaluated = rules.length;

  for (const rule of rules) {
    try {
      const pattern = rule.pattern as RecurrencePattern;
      const fires =
        opts.force ||
        shouldGenerateOn(pattern, target, {
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo,
          skipDays: (rule.skipDays as string[] | null) ?? null,
        });
      if (!fires) continue;
      result.rulesFired++;

      // Resolve targets: one instance per matching room for PER_ROOM, else a
      // single property-wide instance.
      let targets: { roomId: string | null }[];
      if (rule.template.scope === TemplateScope.PER_ROOM) {
        const rooms = await db.room.findMany({
          where: { propertyId: rule.propertyId },
          select: { id: true, roomNumber: true, status: true },
        });
        const filter = (rule.scope as RoomFilter | null) ?? { kind: "all" };
        targets = expandRooms(rooms, filter).map((r) => ({ roomId: r.id }));
      } else {
        targets = [{ roomId: null }];
      }
      if (targets.length === 0) continue;

      // Assignment policy: only "user" pins an assignee; role-pool/unassigned
      // land in the unassigned queue (no assignedRole column in v1).
      const assignment = rule.assignment as RuleAssignment | null;
      const assignedUserId =
        assignment?.type === "user" && assignment.userId ? assignment.userId : null;

      // Idempotency + ADR-009 seq: seq is per (property, template, ET day),
      // restarting at 001 daily and continuing past any pre-existing instances.
      const existing = await db.checklistInstance.findMany({
        where: { propertyId: rule.propertyId, templateId: rule.templateId, scheduledFor: target },
        select: { roomId: true },
      });
      const existingRoomKeys = new Set(existing.map((e) => e.roomId ?? "__property__"));
      let seq = existing.length;

      for (const t of targets) {
        const key = t.roomId ?? "__property__";
        if (existingRoomKeys.has(key)) {
          result.instancesSkipped++;
          continue;
        }
        seq++;
        await db.checklistInstance.create({
          data: {
            systemId: buildSystemId(rule.property.propertyId, rule.template.code, ymd, seq),
            templateId: rule.templateId,
            propertyId: rule.propertyId,
            roomId: t.roomId,
            scheduledFor: target,
            assignedUserId,
            status: assignedUserId ? InstanceStatus.ASSIGNED : InstanceStatus.SCHEDULED,
          },
        });
        existingRoomKeys.add(key);
        result.instancesCreated++;
      }
    } catch (err) {
      result.errors.push({
        ruleId: rule.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
