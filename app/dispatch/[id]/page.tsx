import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager, canAccessProperty } from "@/lib/rbac";
import { db } from "@/lib/db";
import { presignDownload } from "@/lib/r2";
import { formatInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { PhotoFigure } from "@/components/review/PhotoFigure";
import { tradeLabel, tradesLabel } from "@/lib/contractors";
import {
  JOB_PHOTO_MAX,
  isTerminalJobStatus,
  jobStatusLabel,
  rankContractorsForJob,
} from "@/lib/contractor-jobs";
import { JobControls } from "./JobControls";
import { jobLinkUrl } from "@/lib/job-link";
import { buildDispatchMessage, telHref, waMeUrl } from "@/lib/dispatch-message";

// Contractor-job detail (T2). Fields + photos + status + assignment.
// T4's one-tap WhatsApp / call button lands in JobControls next.
export default async function DispatchJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireManager();

  const job = await db.contractorJob.findUnique({
    where: { id },
    select: {
      id: true,
      roomLabel: true,
      trade: true,
      problem: true,
      urgent: true,
      status: true,
      completionNote: true,
      createdAt: true,
      updatedAt: true,
      propertyId: true,
      property: { select: { shortCode: true, name: true } },
      contractor: { select: { id: true, name: true, company: true, whatsapp: true, phone: true } },
      createdBy: { select: { name: true } },
      photos: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          r2Key: true,
          geofenceStatus: true,
          capturedAt: true,
          gpsLat: true,
          gpsLng: true,
        },
      },
    },
  });
  if (!job) notFound();
  if (!(await canAccessProperty(user, job.propertyId))) notFound();

  // Eligible contractors for this property+trade, contracted-first (T3).
  const candidates = await db.contractor.findMany({
    where: { properties: { some: { propertyId: job.propertyId } } },
    select: {
      id: true,
      name: true,
      company: true,
      trades: true,
      contracted: true,
      onCall: true,
      active: true,
      whatsapp: true,
      phone: true,
      language: true,
      properties: { select: { propertyId: true } },
    },
  });
  // Language per contractor — the dispatch message is written in their own
  // language (most of the roster is Spanish-speaking).
  const contractorLocales = new Map(candidates.map((c) => [c.id, c.language]));
  const ranked = rankContractorsForJob(
    candidates.map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      trades: c.trades,
      contracted: c.contracted,
      onCall: c.onCall,
      active: c.active,
      whatsapp: c.whatsapp,
      phone: c.phone,
      propertyIds: c.properties.map((p) => p.propertyId),
    })),
    { propertyId: job.propertyId, trade: job.trade },
  );

  const photos = await Promise.all(
    job.photos.map(async (p) => ({
      id: p.id,
      url: await presignDownload(p.r2Key),
      geofenceStatus: p.geofenceStatus,
      capturedAt: p.capturedAt ? `${formatInET(p.capturedAt, "MMM d, yyyy h:mm a")} ET` : null,
      gpsLat: p.gpsLat != null ? p.gpsLat.toString() : null,
      gpsLng: p.gpsLng != null ? p.gpsLng.toString() : null,
    })),
  );

  const closed = isTerminalJobStatus(job.status);

  // T4: build the outbound message + deep links on the SERVER. The link is
  // signed, so minting it client-side is not an option, and building the message
  // here keeps the wording in one tested place (lib/dispatch-message.ts).
  const linkUrl = jobLinkUrl(job.id);
  const assigned = job.contractor
    ? candidates.find((c) => c.id === job.contractor!.id) ?? null
    : null;
  const dispatchTargets = (assigned ? [assigned] : ranked.slice(0, 3)).map((c) => {
    const message = buildDispatchMessage(
      {
        propertyName: job.property.name,
        propertyShortCode: job.property.shortCode,
        roomLabel: job.roomLabel,
        trade: job.trade,
        problem: job.problem,
        urgent: job.urgent,
        jobUrl: linkUrl,
        contractorName: c.name.split(" ")[0] ?? c.name,
      },
      contractorLocales.get(c.id) ?? "es",
    );
    return {
      id: c.id,
      name: c.name,
      contracted: c.contracted,
      waUrl: waMeUrl(c.whatsapp, message),
      telUrl: telHref(c.phone),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${job.property.shortCode} — ${tradeLabel(job.trade)}${job.roomLabel ? ` — ${job.roomLabel}` : ""}`}
        subtitle={`${jobStatusLabel(job.status)}${job.urgent ? " · URGENT" : ""}`}
        actions={
          <Link
            href="/dispatch"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Queue
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="rounded-lg bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Problem</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{job.problem}</p>
            {job.urgent && (
              <p className="mt-3 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                URGENT
              </p>
            )}
          </section>

          <section className="rounded-lg bg-white p-5 ring-1 ring-slate-200">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Photos
              </h2>
              <span className="text-xs text-slate-400">
                {photos.length} / {JOB_PHOTO_MAX}
              </span>
            </div>
            {photos.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No photos yet. Photos are what stop a contractor arriving without the right part.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                {photos.map((p) => (
                  <PhotoFigure
                    key={p.id}
                    url={p.url}
                    geofenceStatus={p.geofenceStatus}
                    capturedAt={p.capturedAt}
                    gpsLat={p.gpsLat}
                    gpsLng={p.gpsLng}
                  />
                ))}
              </div>
            )}
          </section>

          {job.completionNote && (
            <section className="rounded-lg bg-slate-50 p-5 ring-1 ring-slate-200">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Closing note
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{job.completionNote}</p>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <JobControls
            jobId={job.id}
            status={job.status}
            jobUrl={linkUrl}
            dispatchTargets={dispatchTargets}
            closed={closed}
            assignedContractorId={job.contractor?.id ?? null}
            photoCount={photos.length}
            candidates={ranked.map((c) => ({
              id: c.id,
              name: c.name,
              company: c.company,
              trades: tradesLabel(c.trades),
              contracted: c.contracted,
              onCall: c.onCall,
              whatsapp: c.whatsapp,
              phone: c.phone,
            }))}
          />

          <section className="rounded-lg bg-white p-5 text-sm ring-1 ring-slate-200">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</h2>
            <dl className="mt-3 flex flex-col gap-2 text-slate-700">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Property</dt>
                <dd className="text-right">{job.property.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Where</dt>
                <dd className="text-right">{job.roomLabel ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Raised by</dt>
                <dd className="text-right">{job.createdBy.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Raised</dt>
                <dd className="text-right">{formatInET(job.createdAt, "MMM d, yyyy h:mm a")} ET</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Updated</dt>
                <dd className="text-right">{formatInET(job.updatedAt, "MMM d, yyyy h:mm a")} ET</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
