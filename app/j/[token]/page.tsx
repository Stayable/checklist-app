import { db } from "@/lib/db";
import { presignDownload } from "@/lib/r2";
import { formatInET } from "@/lib/datetime";
import { verifyJobLinkToken } from "@/lib/job-link";
import { tradeLabel } from "@/lib/contractors";
import { jobStatusLabel } from "@/lib/contractor-jobs";

// PUBLIC, no-account contractor view of one job (T4).
//
// Contractors never log in (ADR-025), so the signed token in the URL is the
// entire authorisation. Read-only by construction: this page renders and offers
// no action, so a leaked link exposes one job's details and photos and can
// never change anything.
//
// Deliberately minimal and self-contained: no app shell, no nav, no property
// picker. A contractor standing in a corridor on mobile data needs the address,
// the problem and the photos — nothing else.

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">StayCheck</p>
      {children}
    </main>
  );
}

function Invalid({ message }: { message: string }) {
  return (
    <Shell>
      <div className="rounded-lg bg-amber-50 p-5 ring-1 ring-amber-200">
        <h1 className="text-base font-bold text-amber-900">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-amber-900">{message}</p>
        <p className="mt-3 text-sm text-amber-800">
          Please contact the person who sent it and ask for a new link.
        </p>
      </div>
    </Shell>
  );
}

export default async function ContractorJobLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyJobLinkToken(decodeURIComponent(token));

  if (!verified.ok) {
    // One message for expiry (actionable and not sensitive) and one generic
    // message for everything else — a tampered token must not learn from the
    // response whether the job id or the signature was the problem.
    return (
      <Invalid
        message={
          verified.reason === "expired"
            ? "This job link has expired. Links are valid for 72 hours."
            : "This job link could not be verified."
        }
      />
    );
  }

  const job = await db.contractorJob.findUnique({
    where: { id: verified.jobId },
    select: {
      id: true,
      roomLabel: true,
      trade: true,
      problem: true,
      urgent: true,
      status: true,
      createdAt: true,
      property: { select: { name: true, shortCode: true, address: true } },
      photos: {
        orderBy: { createdAt: "asc" },
        select: { id: true, r2Key: true },
      },
    },
  });

  // A valid signature for a job that no longer exists gets the same generic
  // message — it is not this page's business to confirm what ids exist.
  if (!job) return <Invalid message="This job link could not be verified." />;

  const photoUrls = await Promise.all(job.photos.map((p) => presignDownload(p.r2Key)));

  return (
    <Shell>
      {job.urgent && (
        <p className="rounded-lg bg-red-600 px-4 py-2 text-center text-sm font-bold text-white">
          URGENT
        </p>
      )}

      <header className="rounded-lg bg-white p-5 ring-1 ring-slate-200">
        <h1 className="text-lg font-bold text-slate-900">
          {tradeLabel(job.trade)}
          {job.roomLabel ? ` — ${job.roomLabel}` : ""}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{jobStatusLabel(job.status)}</p>
      </header>

      <section className="rounded-lg bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</h2>
        <p className="mt-2 text-sm font-medium text-slate-900">{job.property.name}</p>
        <p className="text-sm text-slate-600">{job.property.address}</p>
        {/* Map link rather than an embed: opens whatever the contractor already
            uses for navigation, and adds no third-party script to this page. */}
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(job.property.address)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-semibold text-blue-700 underline"
        >
          Open in Maps →
        </a>
      </section>

      <section className="rounded-lg bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Problem</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{job.problem}</p>
      </section>

      {photoUrls.length > 0 && (
        <section className="rounded-lg bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos</h2>
          <div className="mt-3 flex flex-col gap-3">
            {photoUrls.map((url, i) => (
              <a key={job.photos[i]?.id ?? i} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL */}
                <img
                  src={url}
                  alt={`Job photo ${i + 1}`}
                  className="w-full rounded-lg border border-slate-200 object-cover"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-slate-400">
        Raised {formatInET(job.createdAt, "MMM d, yyyy h:mm a")} ET · {job.property.shortCode}
      </p>
      <p className="text-center text-xs text-slate-400">
        Reply on WhatsApp to accept or ask a question.
      </p>
    </Shell>
  );
}
