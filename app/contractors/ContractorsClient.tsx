"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Locale, Trade } from "@prisma/client";
import { ALL_TRADES, tradeLabel, tradesLabel } from "@/lib/contractors";
import {
  createContractor,
  updateContractor,
  setContractorActive,
  type ActionResult,
} from "./actions";

type Row = {
  id: string;
  name: string;
  company: string | null;
  trades: Trade[];
  whatsapp: string | null;
  phone: string | null;
  language: Locale;
  contracted: boolean;
  onCall: boolean;
  active: boolean;
  notes: string | null;
  isStaff: boolean;
  propertyIds: string[];
};

type Prop = { id: string; shortCode: string; name: string };

type FormState = {
  name: string;
  company: string;
  trades: Trade[];
  whatsapp: string;
  phone: string;
  language: Locale;
  contracted: boolean;
  onCall: boolean;
  notes: string;
  propertyIds: string[];
};

const emptyForm = (): FormState => ({
  name: "",
  company: "",
  trades: [],
  whatsapp: "",
  phone: "",
  language: Locale.es,
  contracted: false,
  onCall: true,
  notes: "",
  propertyIds: [],
});

const rowToForm = (r: Row): FormState => ({
  name: r.name,
  company: r.company ?? "",
  trades: r.trades,
  whatsapp: r.whatsapp ?? "",
  phone: r.phone ?? "",
  language: r.language,
  contracted: r.contracted,
  onCall: r.onCall,
  notes: r.notes ?? "",
  propertyIds: r.propertyIds,
});

export function ContractorsClient({
  rows,
  properties,
  canAssignAll,
}: {
  rows: Row[];
  properties: Prop[];
  canAssignAll: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // null = closed; "new" = create form; otherwise the row id being edited.
  const [editing, setEditing] = useState<string | null>(null);

  const shortCode = (id: string) => properties.find((p) => p.id === id)?.shortCode ?? "?";

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setBanner({ kind: "ok", text: res.message ?? "Done." });
        onOk?.();
        router.refresh();
      } else {
        setBanner({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {banner && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            banner.kind === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => {
            setBanner(null);
            setEditing(editing === "new" ? null : "new");
          }}
          className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {editing === "new" ? "Cancel" : "Add contractor"}
        </button>
      </div>

      {editing === "new" && (
        <ContractorForm
          key="new"
          initial={emptyForm()}
          properties={properties}
          canAssignAll={canAssignAll}
          pending={pending}
          onSubmit={(form) =>
            run(() => createContractor(form), () => setEditing(null))
          }
          onCancel={() => setEditing(null)}
        />
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No contractors for this scope yet. Add one to start dispatching.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-lg border p-3 ${
                r.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{r.name}</span>
                    {r.company && <span className="text-sm text-slate-500">· {r.company}</span>}
                    {r.contracted && (
                      <span className="rounded bg-gold/20 px-1.5 py-0.5 text-xs font-medium text-slate-800">
                        Contracted
                      </span>
                    )}
                    {r.isStaff && (
                      <span className="rounded bg-sky/30 px-1.5 py-0.5 text-xs font-medium text-slate-800">
                        Staff
                      </span>
                    )}
                    {!r.active && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        Archived
                      </span>
                    )}
                    {r.active && !r.onCall && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        Off-call
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{tradesLabel(r.trades)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.whatsapp && <span>WhatsApp {r.whatsapp}</span>}
                    {r.whatsapp && r.phone && <span> · </span>}
                    {r.phone && <span>Tel {r.phone}</span>}
                    <span> · {r.language === Locale.es ? "Español" : "English"}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.propertyIds.map((pid) => (
                      <span
                        key={pid}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700"
                      >
                        {shortCode(pid)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setBanner(null);
                      setEditing(editing === r.id ? null : r.id);
                    }}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {editing === r.id ? "Close" : "Edit"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setContractorActive(r.id, !r.active))}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {r.active ? "Archive" : "Reactivate"}
                  </button>
                </div>
              </div>

              {editing === r.id && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <ContractorForm
                    key={r.id}
                    initial={rowToForm(r)}
                    properties={properties}
                    canAssignAll={canAssignAll}
                    pending={pending}
                    onSubmit={(form) =>
                      run(() => updateContractor({ id: r.id, ...form }), () => setEditing(null))
                    }
                    onCancel={() => setEditing(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContractorForm({
  initial,
  properties,
  canAssignAll,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  properties: Prop[];
  canAssignAll: boolean;
  pending: boolean;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const field = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm";
  const label = "text-xs font-medium text-slate-600";

  return (
    <form
      className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Name</label>
          <input
            className={field}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={label}>Company (optional)</label>
          <input
            className={field}
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className={label}>Trades</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {ALL_TRADES.map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${
                form.trades.includes(t)
                  ? "border-navy bg-navy/5 text-navy"
                  : "border-slate-300 text-slate-700"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={form.trades.includes(t)}
                onChange={() => setForm({ ...form, trades: toggle(form.trades, t) })}
              />
              {tradeLabel(t)}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>WhatsApp number</label>
          <input
            className={field}
            value={form.whatsapp}
            placeholder="+1 407 555 0134"
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Phone (emergency first-touch)</label>
          <input
            className={field}
            value={form.phone}
            placeholder="+1 407 555 0134"
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Language</label>
          <select
            className={field}
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value as Locale })}
          >
            <option value={Locale.es}>Español</option>
            <option value={Locale.en}>English</option>
          </select>
        </div>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.contracted}
              onChange={(e) => setForm({ ...form, contracted: e.target.checked })}
            />
            Contracted (call first)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.onCall}
              onChange={(e) => setForm({ ...form, onCall: e.target.checked })}
            />
            On-call
          </label>
        </div>
      </div>

      <div>
        <label className={label}>
          Properties covered{!canAssignAll && " (your properties)"}
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          {properties.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${
                form.propertyIds.includes(p.id)
                  ? "border-navy bg-navy/5 text-navy"
                  : "border-slate-300 text-slate-700"
              }`}
              title={p.name}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={form.propertyIds.includes(p.id)}
                onChange={() => setForm({ ...form, propertyIds: toggle(form.propertyIds, p.id) })}
              />
              {p.shortCode}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={label}>Notes (optional)</label>
        <textarea
          className={field}
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
