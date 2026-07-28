"use server";

import { revalidatePath } from "next/cache";
import { GeofenceStatus, JobStatus, Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessProperty, isManagerOrAbove } from "@/lib/rbac";
import { geofenceStatusFor } from "@/lib/geofence";
import {
  JOB_PHOTO_MAX,
  assignSchema,
  canAssignContractor,
  createJobSchema,
  isTerminalJobStatus,
  updateStatusSchema,
} from "@/lib/contractor-jobs";

// Contractor-job actions (T2). Mirrors app/issues/actions.ts and T1's
// app/contractors/actions.ts: manager-or-above, property-scoped, Zod-validated,
// every mutation audit-logged. Nothing here sends anything to a contractor —
// dispatch is human-initiated and lands in T4.

export type JobResult = { ok: true; id?: string } | { ok: false; error: string };

const idSchema = z.string().uuid();

type Actor = { id: string; role: Role };

async function requireDispatcher(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user || !isManagerOrAbove(session.user.role)) return null;
  return { id: session.user.id, role: session.user.role };
}

function revalidateJob(id?: string) {
  revalidatePath("/dispatch");
  if (id) revalidatePath(`/dispatch/${id}`);
}

export async function createContractorJob(input: unknown): Promise<JobResult> {
  const actor = await requireDispatcher();
  if (!actor) return { ok: false, error: "Not authorized." };

  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { propertyId, trade, problem, roomLabel, urgent } = parsed.data;

  // A scoped manager may only raise jobs at their own properties.
  if (!(await canAccessProperty(actor, propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }

  const job = await db.$transaction(async (tx) => {
    const created = await tx.contractorJob.create({
      data: {
        propertyId,
        trade,
        problem,
        roomLabel: roomLabel ? roomLabel : null,
        urgent: urgent ?? false,
        createdByUserId: actor.id,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        entityType: "ContractorJob",
        entityId: created.id,
        action: "create",
        after: { propertyId, trade, problem, roomLabel: roomLabel || null, urgent: urgent ?? false },
      },
    });
    return created;
  });

  revalidateJob(job.id);
  return { ok: true, id: job.id };
}

async function loadGuarded(
  jobId: string,
): Promise<
  | { ok: true; actor: Actor; job: { id: string; status: JobStatus; propertyId: string; trade: import("@prisma/client").Trade; contractorId: string | null } }
  | { ok: false; error: string }
> {
  const actor = await requireDispatcher();
  if (!actor) return { ok: false, error: "Not authorized." };
  if (!idSchema.safeParse(jobId).success) return { ok: false, error: "Invalid id." };

  const job = await db.contractorJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, propertyId: true, trade: true, contractorId: true },
  });
  if (!job) return { ok: false, error: "Job not found." };
  if (!(await canAccessProperty(actor, job.propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }
  return { ok: true, actor, job };
}

export async function updateJobStatus(jobId: string, input: unknown): Promise<JobResult> {
  const loaded = await loadGuarded(jobId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { actor, job } = loaded;

  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { status, completionNote } = parsed.data;

  // A finished job stays finished. Re-opening would need a reason trail we
  // haven't designed, and silently allowing it would let a COMPLETED job lose
  // its completion note.
  if (isTerminalJobStatus(job.status)) {
    return { ok: false, error: "This job is already closed." };
  }
  if (status === job.status) return { ok: true, id: job.id };

  // Dispatching means "a contractor has been told", so it needs a contractor.
  if (status === JobStatus.DISPATCHED && job.contractorId === null) {
    return { ok: false, error: "Assign a contractor before marking the job dispatched." };
  }

  await db.$transaction(async (tx) => {
    await tx.contractorJob.update({
      where: { id: job.id },
      data: {
        status,
        completionNote: isTerminalJobStatus(status) ? (completionNote as string) : undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        entityType: "ContractorJob",
        entityId: job.id,
        action: "status",
        before: { status: job.status },
        after: { status, completionNote: completionNote || null },
      },
    });
  });

  revalidateJob(job.id);
  return { ok: true, id: job.id };
}

export async function assignContractor(jobId: string, input: unknown): Promise<JobResult> {
  const loaded = await loadGuarded(jobId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { actor, job } = loaded;

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { contractorId } = parsed.data;

  if (isTerminalJobStatus(job.status)) {
    return { ok: false, error: "This job is already closed." };
  }

  if (contractorId !== null) {
    const contractor = await db.contractor.findUnique({
      where: { id: contractorId },
      select: {
        id: true,
        active: true,
        trades: true,
        properties: { select: { propertyId: true } },
      },
    });
    if (!contractor) return { ok: false, error: "Contractor not found." };

    // Same eligibility rule the T3 matcher uses, enforced server-side: the UI
    // only offers eligible contractors, but the action must not trust that.
    const eligible = canAssignContractor(
      {
        id: contractor.id,
        name: "",
        company: null,
        trades: contractor.trades,
        contracted: false,
        onCall: true,
        active: contractor.active,
        whatsapp: null,
        phone: null,
        propertyIds: contractor.properties.map((p) => p.propertyId),
      },
      { propertyId: job.propertyId, trade: job.trade },
    );
    if (!eligible) {
      return {
        ok: false,
        error: "That contractor doesn't cover this property and trade, or is archived.",
      };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.contractorJob.update({ where: { id: job.id }, data: { contractorId } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        entityType: "ContractorJob",
        entityId: job.id,
        action: contractorId === null ? "unassign" : "assign",
        before: { contractorId: job.contractorId },
        after: { contractorId },
      },
    });
  });

  revalidateJob(job.id);
  return { ok: true, id: job.id };
}

// --- Photos -----------------------------------------------------------------

// Bytes are already in R2 (client PUT via presigned URL); this validates the
// key shape and computes geofence server-side, exactly as closeIssue does.
const photoRefSchema = z.object({
  key: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracy: z.number().nullable(),
  sizeBytes: z.number(),
  capturedAt: z.string().datetime().nullable().optional(),
});

const addPhotosSchema = z.object({
  photos: z.array(photoRefSchema).min(1).max(JOB_PHOTO_MAX),
});

// Keys are server-minted (lib/r2.ts contractorJobPhotoKey): a UUID filename
// under this job's prefix and nothing else. Anything else is forged.
function isValidJobPhotoKey(key: string, jobId: string): boolean {
  return new RegExp(
    `^contractor-jobs/${jobId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$`,
  ).test(key);
}

export async function addJobPhotos(jobId: string, input: unknown): Promise<JobResult> {
  const loaded = await loadGuarded(jobId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { actor, job } = loaded;

  if (isTerminalJobStatus(job.status)) {
    return { ok: false, error: "This job is already closed." };
  }

  const parsed = addPhotosSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid photo payload." };

  const existing = await db.photo.count({ where: { contractorJobId: job.id } });
  if (existing + parsed.data.photos.length > JOB_PHOTO_MAX) {
    return { ok: false, error: `A job can hold at most ${JOB_PHOTO_MAX} photos.` };
  }

  const property = await db.property.findUnique({
    where: { id: job.propertyId },
    select: { geofence: true },
  });

  const rows = parsed.data.photos.map((ref) => {
    if (!isValidJobPhotoKey(ref.key, job.id)) return null;
    return {
      contractorJobId: job.id,
      r2Key: ref.key,
      fileSizeBytes: Math.round(ref.sizeBytes),
      gpsLat: ref.lat,
      gpsLng: ref.lng,
      capturedAt: ref.capturedAt ? new Date(ref.capturedAt) : null,
      geofenceStatus:
        ref.lat !== null && ref.lng !== null
          ? geofenceStatusFor({ lat: ref.lat, lng: ref.lng }, property?.geofence ?? null)
          : GeofenceStatus.NO_GPS,
    };
  });
  if (rows.some((r) => r === null)) {
    return { ok: false, error: "Invalid photo reference. Re-add the photos and try again." };
  }

  await db.$transaction(async (tx) => {
    await tx.photo.createMany({ data: rows.map((r) => r!) });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        entityType: "ContractorJob",
        entityId: job.id,
        action: "add_photos",
        after: { photoCount: rows.length },
      },
    });
  });

  revalidateJob(job.id);
  return { ok: true, id: job.id };
}
