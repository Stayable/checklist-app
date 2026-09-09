import type { Prisma } from "@prisma/client";
import { db } from "./db";

// ADR-036 — loading the question set an instance was created against.
//
// This exists because a nested `template: { include: { questions } }` CANNOT
// express it: Prisma has no way to filter a nested relation by a column on the
// parent row, and the filter here is `version = instance.templateVersion`.
// Every instance-scoped read therefore fetches questions separately, through
// one of these two helpers, so the version rule lives in one place instead of
// being re-derived (and eventually forgotten) at six call sites.

/** Anything carrying the two fields that identify a question set. */
export type VersionedInstance = { templateId: string; templateVersion: number };

const ORDER = { orderIndex: "asc" } as const satisfies Prisma.QuestionOrderByWithRelationInput;

/**
 * The ordered questions one instance was created against — NOT the template's
 * current set. An instance created before a template edit keeps rendering the
 * questions it was actually filled against (Kyle, 2026-09-09).
 */
export async function questionsForInstance(instance: VersionedInstance) {
  return db.question.findMany({
    where: { templateId: instance.templateId, version: instance.templateVersion },
    orderBy: ORDER,
  });
}

/**
 * Batched form for list screens (the review queue), which would otherwise fire
 * one query per row.
 *
 * Instances commonly share a (template, version) pair, so the OR is built from
 * the DISTINCT pairs rather than one clause per instance. Returns a lookup
 * keyed by `templateId + ":" + version`; use {@link questionSetKey} to read it.
 */
export async function questionsForInstances(instances: VersionedInstance[]) {
  const pairs = new Map<string, VersionedInstance>();
  for (const i of instances) {
    pairs.set(questionSetKey(i), { templateId: i.templateId, templateVersion: i.templateVersion });
  }
  const byKey = new Map<string, Awaited<ReturnType<typeof questionsForInstance>>>();
  if (pairs.size === 0) return byKey;

  const rows = await db.question.findMany({
    where: {
      OR: [...pairs.values()].map((p) => ({
        templateId: p.templateId,
        version: p.templateVersion,
      })),
    },
    orderBy: ORDER,
  });
  for (const key of pairs.keys()) byKey.set(key, []);
  for (const q of rows) {
    // `rows` arrives already ordered, so pushing preserves orderIndex per set.
    byKey.get(`${q.templateId}:${q.version}`)?.push(q);
  }
  return byKey;
}

/** Lookup key for the map {@link questionsForInstances} returns. */
export function questionSetKey(instance: VersionedInstance): string {
  return `${instance.templateId}:${instance.templateVersion}`;
}
