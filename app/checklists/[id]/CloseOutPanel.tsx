"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { InvalidationReason } from "@prisma/client";
import { closesImmediately, REASON_MESSAGE_KEY, REASON_ORDER } from "@/lib/invalidation";
import { requestInvalidation } from "./invalidate.action";

// Field-facing close-out: the checklist stopped being needed (stayover, room
// not needed) or could not be done (no access, staff unavailable).
//
// Bilingual per ADR-013. Collapsed by default and placed after Submit, because
// completing the work is the normal path and this must never compete with it —
// but reachable in one tap, since the alternative a tester found was submitting
// a checklist for work that never happened, which corrupts the completion rate.

export function CloseOutPanel({
  instanceId,
  pending: alreadyRequested,
}: {
  instanceId: string;
  /** A request is already waiting on a manager. */
  pending: boolean;
}) {
  const t = useTranslations("Checklist");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<InvalidationReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"closed" | "requested" | null>(null);
  const [busy, startTransition] = useTransition();

  if (outcome) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        {outcome === "closed" ? t("closeOutClosed") : t("closeOutRequested")}
      </p>
    );
  }

  if (alreadyRequested) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        {t("closeOutPendingNotice")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm font-semibold text-slate-500 underline"
      >
        {t("closeOutOpen")}
      </button>
    );
  }

  // Which button and which warning to show depends on the reason, so the user
  // knows before pressing whether they are done or waiting on someone.
  const immediate = reason !== "" && closesImmediately(reason);

  function submit() {
    if (reason === "" || note.trim() === "") return;
    setError(null);
    startTransition(async () => {
      const res = await requestInvalidation({ instanceId, reasonCode: reason, note });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOutcome(res.closed ? "closed" : "requested");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{t("closeOutTitle")}</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-slate-400 underline"
        >
          {t("closeOutCancel")}
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        {t("closeOutReason")}
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as InvalidationReason | "")}
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900"
        >
          <option value="">—</option>
          {REASON_ORDER.map((r) => (
            <option key={r} value={r}>
              {t(REASON_MESSAGE_KEY[r])}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        {t("closeOutNote")}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={t("closeOutNotePlaceholder")}
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900"
        />
      </label>

      {reason !== "" && (
        <p className={`text-xs ${immediate ? "text-slate-500" : "text-amber-700"}`}>
          {immediate ? t("closeOutClosesNow") : t("closeOutNeedsApproval")}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || reason === "" || note.trim() === ""}
        className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
      >
        {immediate ? t("closeOutSubmitNow") : t("closeOutSubmitRequest")}
      </button>
    </div>
  );
}
