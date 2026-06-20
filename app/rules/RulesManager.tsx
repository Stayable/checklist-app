"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Role, TemplateScope } from "@prisma/client";
import { describePattern, describeScope, type RecurrencePattern, type RoomFilter } from "@/lib/recurrence";
import { createRule, deleteRule, forceCreateToday, setRuleActive } from "./actions";

type Property = { id: string; shortCode: string; name: string };
type Template = { id: string; code: string; name: string; scope: TemplateScope; defaultRole: Role };
type Assignment =
  | { type: "user"; userId: string }
  | { type: "role"; role: Role }
  | { type: "unassigned" };

export type RuleRow = {
  id: string;
  templateName: string;
  templateCode: string;
  isPerRoom: boolean;
  shortCode: string;
  pattern: RecurrencePattern;
  scope: RoomFilter | null;
  assignment: Assignment;
  active: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ASSIGNABLE_ROLES: Role[] = [Role.HK, Role.PA, Role.MT, Role.MANAGER];

export function RulesManager({
  properties,
  templates,
  rules,
  usersByProperty,
}: {
  properties: Property[];
  templates: Template[];
  rules: RuleRow[];
  usersByProperty: Record<string, { id: string; name: string; role: Role }[]>;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {showForm ? "Cancel" : "+ New rule"}
        </button>
      </div>

      {showForm && (
        <CreateForm
          properties={properties}
          templates={templates}
          usersByProperty={usersByProperty}
          onDone={() => setShowForm(false)}
        />
      )}

      {rules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No recurring rules yet. Create one to auto-generate checklists.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rules.map((r) => (
            <RuleCard key={r.id} rule={r} usersByProperty={usersByProperty} />
          ))}
        </ul>
      )}
    </div>
  );
}

function assignmentLabel(
  a: Assignment,
  users: { id: string; name: string; role: Role }[] | undefined,
): string {
  if (a.type === "unassigned") return "Unassigned queue";
  if (a.type === "role") return `${a.role} pool`;
  const u = users?.find((x) => x.id === a.userId);
  return u ? u.name : "Specific user";
}

function RuleCard({
  rule,
  usersByProperty,
}: {
  rule: RuleRow;
  usersByProperty: Record<string, { id: string; name: string; role: Role }[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setErr(res.error ?? "Something went wrong.");
      else {
        setMsg(res.message ?? "Done.");
        router.refresh();
      }
    });
  };

  // usersByProperty is keyed by property UUID; we only have shortCode on the row,
  // so flatten to resolve a "specific user" name regardless of property.
  const allUsers = useMemo(() => Object.values(usersByProperty).flat(), [usersByProperty]);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-navy/10 px-1.5 py-0.5 text-xs font-bold text-navy">
              {rule.shortCode}
            </span>
            <span className="truncate font-semibold text-slate-900">{rule.templateName}</span>
            {!rule.active && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                Paused
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {describePattern(rule.pattern)}
            {rule.isPerRoom && ` · ${describeScope(rule.scope)}`}
            {` · ${assignmentLabel(rule.assignment, allUsers)}`}
          </p>
          {(rule.effectiveFrom || rule.effectiveTo) && (
            <p className="mt-0.5 text-xs text-slate-400">
              {rule.effectiveFrom ? `From ${rule.effectiveFrom}` : "From start"}
              {rule.effectiveTo ? ` to ${rule.effectiveTo}` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          disabled={pending}
          onClick={() => act(() => setRuleActive(rule.id, !rule.active))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {rule.active ? "Pause" : "Activate"}
        </button>
        <button
          disabled={pending}
          onClick={() => act(() => forceCreateToday(rule.id))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Force-create today
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm("Delete this rule? Existing instances are kept.")) {
              act(() => deleteRule(rule.id));
            }
          }}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </li>
  );
}

function CreateForm({
  properties,
  templates,
  usersByProperty,
  onDone,
}: {
  properties: Property[];
  templates: Template[];
  usersByProperty: Record<string, { id: string; name: string; role: Role }[]>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [patternType, setPatternType] = useState<RecurrencePattern["type"]>("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [scopeKind, setScopeKind] = useState<RoomFilter["kind"]>("all");
  const [roomList, setRoomList] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [assignType, setAssignType] = useState<Assignment["type"]>("unassigned");
  const [assignRole, setAssignRole] = useState<Role>(Role.HK);
  const [assignUserId, setAssignUserId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  const template = templates.find((t) => t.id === templateId);
  const isPerRoom = template?.scope === TemplateScope.PER_ROOM;
  const propertyUsers = usersByProperty[propertyId] ?? [];

  function buildPattern(): RecurrencePattern {
    switch (patternType) {
      case "weekly":
        return { type: "weekly", daysOfWeek };
      case "monthly":
        return { type: "monthly", dayOfMonth };
      case "quarterly":
        return { type: "quarterly", dayOfMonth };
      case "on-demand":
        return { type: "on-demand" };
      default:
        return { type: "daily" };
    }
  }

  function buildScope(): RoomFilter | null {
    if (!isPerRoom) return null;
    switch (scopeKind) {
      case "list":
        return {
          kind: "list",
          roomNumbers: roomList.split(",").map((s) => s.trim()).filter(Boolean),
        };
      case "range":
        return { kind: "range", from: rangeFrom.trim(), to: rangeTo.trim() };
      case "occupied":
        return { kind: "occupied" };
      case "vacant":
        return { kind: "vacant" };
      default:
        return { kind: "all" };
    }
  }

  function buildAssignment(): Assignment {
    if (assignType === "role") return { type: "role", role: assignRole };
    if (assignType === "user" && assignUserId) return { type: "user", userId: assignUserId };
    return { type: "unassigned" };
  }

  const submit = () => {
    setErr(null);
    start(async () => {
      const res = await createRule({
        templateId,
        propertyId,
        pattern: buildPattern(),
        scope: buildScope(),
        assignment: buildAssignment(),
        effectiveFrom: effectiveFrom ? effectiveFrom.replaceAll("-", "") : null,
        effectiveTo: effectiveTo ? effectiveTo.replaceAll("-", "") : null,
        active: true,
      });
      if (!res.ok) setErr(res.error);
      else {
        router.refresh();
        onDone();
      }
    });
  };

  const field = "rounded-lg border border-slate-300 p-2 text-sm";
  const label = "text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 font-bold text-slate-900">New recurring rule</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={label}>Property</span>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={field}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.shortCode} — {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Template</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={field}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={label}>Pattern</span>
          <select
            value={patternType}
            onChange={(e) => setPatternType(e.target.value as RecurrencePattern["type"])}
            className={field}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="on-demand">On-demand</option>
          </select>
        </label>

        {patternType === "weekly" && (
          <div className="flex flex-col gap-1">
            <span className={label}>Days</span>
            <div className="flex flex-wrap gap-1">
              {DOW.map((d, i) => {
                const on = daysOfWeek.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDaysOfWeek((prev) =>
                        prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                      )
                    }
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold ${
                      on ? "bg-navy text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(patternType === "monthly" || patternType === "quarterly") && (
          <label className="flex flex-col gap-1">
            <span className={label}>Day of month</span>
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              className={field}
            />
          </label>
        )}

        {isPerRoom && (
          <label className="flex flex-col gap-1">
            <span className={label}>Room scope</span>
            <select
              value={scopeKind}
              onChange={(e) => setScopeKind(e.target.value as RoomFilter["kind"])}
              className={field}
            >
              <option value="all">All rooms</option>
              <option value="occupied">Occupied only</option>
              <option value="vacant">Vacant only</option>
              <option value="list">Specific rooms</option>
              <option value="range">Room range</option>
            </select>
          </label>
        )}

        {isPerRoom && scopeKind === "list" && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={label}>Room numbers (comma-separated)</span>
            <input
              value={roomList}
              onChange={(e) => setRoomList(e.target.value)}
              placeholder="101, 102, 210"
              className={field}
            />
          </label>
        )}

        {isPerRoom && scopeKind === "range" && (
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <label className="flex flex-col gap-1">
              <span className={label}>From room</span>
              <input value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>To room</span>
              <input value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className={field} />
            </label>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className={label}>Assignment</span>
          <select
            value={assignType}
            onChange={(e) => setAssignType(e.target.value as Assignment["type"])}
            className={field}
          >
            <option value="unassigned">Unassigned queue</option>
            <option value="role">Role pool</option>
            <option value="user">Specific user</option>
          </select>
        </label>

        {assignType === "role" && (
          <label className="flex flex-col gap-1">
            <span className={label}>Role</span>
            <select
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value as Role)}
              className={field}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}

        {assignType === "user" && (
          <label className="flex flex-col gap-1">
            <span className={label}>User</span>
            <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className={field}>
              <option value="">Select a user…</option>
              {propertyUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className={label}>Effective from (optional)</span>
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Effective to (optional)</span>
          <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className={field} />
        </label>
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <div className="mt-5 flex gap-2">
        <button
          disabled={pending || (assignType === "user" && !assignUserId)}
          onClick={submit}
          className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create rule"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
