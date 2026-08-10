"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trade } from "@prisma/client";
import { TRADES_ORDERED, tradeLabel } from "@/lib/contractors";
import { archiveContractor, createContractor, updateContractor } from "./actions";

type PropertyOption = { id: string; shortCode: string; name: string };

type Row = {
  id: string;
  name: string;
  company: string | null;
  trades: Trade[];
  phone: string | null;
  whatsapp: string | null;
  active: boolean;
  propertyIds: string[];
  propertyShortCodes: string[];
};

type FormState = {
  name: string;
  trades: Trade[];
  propertyIds: string[];
  phone: string;
  whatsapp: string;
};

const EMPTY_FORM: FormState = { name: "", trades: [], propertyIds: [], phone: "", whatsapp: "" };

export function ContractorsClient({
  rows,
  properties,
}: {
  rows: Row[];
  properties: PropertyOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: Row) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      trades: row.trades,
      propertyIds: row.propertyIds,
      phone: row.phone ?? "",
      whatsapp: row.whatsapp ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function toggleTrade(trade: Trade) {
    setForm((f) => ({
      ...f,
      trades: f.trades.includes(trade) ? f.trades.filter((t) => t !== trade) : [...f.trades, trade],
    }));
  }

  function toggleProperty(propertyId: string) {
    setForm((f) => ({
      ...f,
      propertyIds: f.propertyIds.includes(propertyId)
        ? f.propertyIds.filter((id) => id !== propertyId)
        : [...f.propertyIds, propertyId],
    }));
  }

  function submit() {
    setFormError(null);
    const input = {
      name: form.name,
      trades: form.trades,
      propertyIds: form.propertyIds,
      phone: form.phone.trim() ? form.phone.trim() : null,
      whatsapp: form.whatsapp.trim() ? form.whatsapp.trim() : null,
    };
    const savedName = form.name;
    startTransition(async () => {
      const res = editingId ? await updateContractor(editingId, input) : await createContractor(input);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setBanner({
        kind: "ok",
        text: editingId ? `Saved "${savedName}".` : `Added "${savedName}".`,
      });
      closeForm();
      router.refresh();
    });
  }

  function onToggleActive(row: Row) {
    const next = !row.active;
    if (
      !next &&
      !confirm(`Archive "${row.name}"? It stays visible (marked Archived) and can be reactivated later.`)
    ) {
      return;
    }
    startTransition(async () => {
      const res = await archiveContractor(row.id, next);
      setBanner(
        res.ok
          ? { kind: "ok", text: next ? `Reactivated "${row.name}".` : `Archived "${row.name}".` }
          : { kind: "err", text: res.error },
      );
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {banner && (
        <div
          className={`rounded-md p-2 text-sm ${
            banner.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {banner.text}
        </div>
      )}

      {!formOpen && (
        <div>
          <button
            onClick={openCreate}
            className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Add contractor
          </button>
        </div>
      )}

      {formOpen && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-navy">
            {editingId ? "Edit contractor" : "New contractor"}
          </h2>
          {formError && (
            <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{formError}</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Phone</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">WhatsApp</span>
              <input
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-1.5"
              />
              <span className="text-xs text-slate-500">
                Contact info only — nothing here sends a message.
              </span>
            </label>
          </div>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-slate-700">Trades</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {TRADES_ORDERED.map((trade) => (
                <label key={trade} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.trades.includes(trade)}
                    onChange={() => toggleTrade(trade)}
                  />
                  {tradeLabel(trade)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-slate-700">Properties</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {properties.map((property) => (
                <label key={property.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.propertyIds.includes(property.id)}
                    onChange={() => toggleProperty(property.id)}
                  />
                  {property.shortCode}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={submit}
              disabled={pending}
              className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {editingId ? "Save" : "Add"}
            </button>
            <button
              onClick={closeForm}
              disabled={pending}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm text-slate-600">No contractors yet. Add one to start scheduling work.</p>
          {!formOpen && (
            <button
              onClick={openCreate}
              className="mt-3 inline-block rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
            >
              Add contractor
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`flex items-start justify-between gap-3 rounded-lg p-4 shadow-sm ring-1 ring-slate-200 ${
                row.active ? "bg-white" : "bg-slate-50 opacity-70"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{row.name}</span>
                  {row.company && <span className="text-sm text-slate-500">{row.company}</span>}
                  {!row.active && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                      Archived
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.trades.length > 0 ? row.trades.map(tradeLabel).join(", ") : "No trades set"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[row.phone, row.whatsapp ? `WhatsApp ${row.whatsapp}` : null]
                    .filter(Boolean)
                    .join(" · ") || "No contact info"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.propertyShortCodes.length > 0 ? row.propertyShortCodes.join(", ") : "No properties"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => openEdit(row)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-navy ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => onToggleActive(row)}
                  disabled={pending}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 disabled:opacity-50 ${
                    row.active
                      ? "text-red-600 ring-red-200 hover:bg-red-50"
                      : "text-emerald-700 ring-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  {row.active ? "Archive" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
