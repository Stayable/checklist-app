"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Locale, Role } from "@prisma/client";
import { ChevronDown } from "lucide-react";
import { SelectField } from "@/components/ui/select";
import { formatInET } from "@/lib/datetime";
import { canAdministerUser, explainAssignability, locationAffectsAssignment } from "@/lib/roles";

// Mirror of MIN_PASSWORD_LENGTH in lib/password.ts (kept local so this client
// bundle doesn't import the server-only crypto module). Server re-validates.
const MIN_PASSWORD_LENGTH = 8;
import {
  createUser,
  deleteUser,
  resetPassword,
  setUserActive,
  setUserAssignable,
  setUserPassword,
  setUserProperties,
  setUserRemote,
  setUserRole,
  unlockUser,
  type ActionResult,
} from "./actions";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  locale: Locale;
  /** Location: true = Remote, false = On-site (`users.remote`). */
  remote: boolean;
  /** Per-user override forcing this account into the "Assign to" pool. */
  alwaysAssignable: boolean;
  active: boolean;
  lastLoginAt: string | null;
  /** Inside an active failed-login lockout as of server render (ADR-008). */
  locked: boolean;
  lockedUntil: string | null;
  propertyIds: string[];
};

type Prop = { id: string; shortCode: string; name: string };

const isPortfolio = (r: Role) => r === Role.CORPORATE || r === Role.ADMIN;

// LAYOUT (rebuilt 2026-09-11). The previous table put SIX text buttons in a
// right-hand Actions cell and grew a seventh column when Location arrived; the
// result ran past its container, which was `overflow-hidden`, so "Delete"
// rendered as "D" and the header as "ACTI". Three changes fixed it, and each
// buys width rather than hiding information:
//
//   • Row actions collapse to ONE "Manage" toggle. The panel it opens already
//     existed for Properties and Set PW — this merges all three into a single
//     expansion, which also drops the component from three open-row states to
//     one. Deliberately NOT a floating menu: the table scrolls horizontally,
//     and an absolutely-positioned popup inside a scroll container is clipped
//     by it (SelectField escapes that only because Base UI portals to <body>).
//   • Status moved INTO the user cell. It describes the person, and Inactive /
//     Locked are short chips that cost no column of their own.
//   • Properties collapse to "All 8" once a user holds every active property,
//     instead of wrapping "DP, JN, JW, KE, KW, LL, OR, SA" onto three lines.
//
// The container is `overflow-x-auto` now, so a future column scrolls into view
// rather than being silently cut off.

/**
 * Options for a row's role picker.
 *
 * The current role is always present even when the actor may not grant it, so
 * the select shows what the account actually is rather than silently rendering
 * its first option. Cannot happen today — an actor who may manage a row may
 * grant every role that row could hold — but a select whose value is absent
 * from its options misreports the database, which is the worst failure this
 * screen has.
 */
function roleOptions(current: Role, assignable: Role[]) {
  const values = assignable.includes(current) ? assignable : [current, ...assignable];
  return values.map((r) => ({ value: r, label: r }));
}

const LOCATION_OPTIONS = [
  { value: "onsite", label: "On-site" },
  { value: "remote", label: "Remote" },
];

const LOCATION_LIVE_HINT =
  "Drives the Assign to pool — a Remote manager is not offered room-level work.";
const LOCATION_INERT_HINT =
  "Recorded for reference. Only a MANAGER's assignment pool reads this.";

export function UsersClient({
  initialUsers,
  properties,
  currentUserId,
  actorRole,
  assignableRoles,
}: {
  initialUsers: AdminUser[];
  properties: Prop[];
  currentUserId: string;
  /** Role of the signed-in user — decides which rows are actionable. */
  actorRole: Role;
  /** Roles this actor may grant. CORPORATE never receives ADMIN. */
  assignableRoles: Role[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string; secret?: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // One open row at a time. Replaced the separate `editing` and `pwFor` states
  // when the row actions collapsed into a single panel.
  const [openRow, setOpenRow] = useState<string | null>(null);

  const shortCode = (id: string) => properties.find((p) => p.id === id)?.shortCode ?? "?";

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setBanner({ kind: "ok", text: res.message ?? "Done.", secret: res.tempPassword });
        router.refresh();
      } else {
        setBanner({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {banner && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div className="flex items-center justify-between">
            <span>{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-xs underline">
              dismiss
            </button>
          </div>
          {banner.secret && (
            <p className="mt-2 font-mono text-base font-bold text-slate-900">
              Temp password: {banner.secret}
            </p>
          )}
        </div>
      )}

      <div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy/90"
        >
          {showCreate ? "Cancel" : "+ Add user"}
        </button>
      </div>

      {showCreate && (
        <CreateUserForm
          properties={properties}
          assignableRoles={assignableRoles}
          pending={pending}
          onSubmit={(payload) =>
            run(async () => {
              const res = await createUser(payload);
              if (res.ok) setShowCreate(false);
              return res;
            })
          }
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="w-44 px-3 py-3 font-semibold">Role</th>
              <th className="w-40 px-3 py-3 font-semibold">Location</th>
              <th className="w-28 px-3 py-3 font-semibold">Properties</th>
              <th className="w-28 px-3 py-3 font-semibold">Last login</th>
              <th className="w-36 px-4 py-3 text-right font-semibold">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialUsers.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                properties={properties}
                shortCode={shortCode}
                pending={pending}
                assignableRoles={assignableRoles}
                // Server-side truth is canAdministerUser in actions.ts; this is
                // the same predicate, used to avoid offering a control that
                // would only come back refused.
                manageable={canAdministerUser(actorRole, u.role)}
                open={openRow === u.id}
                isSelf={u.id === currentUserId}
                onToggleOpen={() => setOpenRow(openRow === u.id ? null : u.id)}
                onSetPw={(pw) =>
                  run(async () => {
                    const res = await setUserPassword(u.id, pw);
                    if (res.ok) setOpenRow(null);
                    return res;
                  })
                }
                onSetRole={(role) => run(() => setUserRole({ userId: u.id, role }))}
                onSetAssignable={(assignable) =>
                  run(() => setUserAssignable({ userId: u.id, assignable }))
                }
                onSetRemote={(remote) => run(() => setUserRemote({ userId: u.id, remote }))}
                onReset={() => run(() => resetPassword(u.id))}
                onUnlock={() => run(() => unlockUser(u.id))}
                onToggleActive={() => run(() => setUserActive(u.id, !u.active))}
                onDelete={() => {
                  if (!confirm(`Permanently delete ${u.email}? This can't be undone.`)) return;
                  run(() => deleteUser(u.id));
                }}
                onSaveProps={(ids) =>
                  run(async () => {
                    const res = await setUserProperties({ userId: u.id, propertyIds: ids });
                    if (res.ok) setOpenRow(null);
                    return res;
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* One footnote instead of a "reference only" caption repeated under most
          rows — it cost a line of height on every non-manager row to say the
          same thing each time. The greyed control still carries it as a
          tooltip, so the per-row answer is still one hover away. */}
      <p className="text-xs text-slate-500">
        Location is recorded for everyone, but only changes the &ldquo;Assign to&rdquo; pool for{" "}
        <span className="font-semibold">MANAGER</span>, where a Remote manager is not offered
        room-level work. Greyed controls are recorded for reference only.
      </p>
    </div>
  );
}

function CreateUserForm({
  properties,
  assignableRoles,
  pending,
  onSubmit,
}: {
  properties: Prop[];
  assignableRoles: Role[];
  pending: boolean;
  onSubmit: (payload: {
    name: string;
    email: string;
    role: Role;
    locale: Locale;
    remote: boolean;
    propertyIds: string[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(Role.HK);
  const [locale, setLocale] = useState<Locale>(Locale.en);
  // On-site by default: the failure mode of a wrong default should be "shows up
  // in a pick-list they don't belong in", not "a real employee is invisible and
  // cannot be assigned work" (schema.prisma, users.remote).
  const [remote, setRemote] = useState(false);
  const [propertyIds, setPropertyIds] = useState<string[]>([]);

  const portfolio = isPortfolio(role);
  const input =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, email, role, locale, remote, propertyIds });
      }}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Full name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Email</span>
          <input
            className={input}
            type="email"
            placeholder="work@rentstayable.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Role</span>
          <SelectField
            ariaLabel="Role"
            value={role}
            onChange={(next) => setRole(next as Role)}
            options={assignableRoles.map((r) => ({ value: r, label: r }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Language</span>
          <SelectField
            ariaLabel="Language"
            value={locale}
            onChange={(next) => setLocale(next as Locale)}
            options={[
              { value: Locale.en, label: "English" },
              { value: Locale.es, label: "Spanish" },
            ]}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Location</span>
          <SelectField
            ariaLabel="Location"
            value={remote ? "remote" : "onsite"}
            onChange={(next) => setRemote(next === "remote")}
            options={LOCATION_OPTIONS}
          />
          <span className="text-xs text-slate-400">
            {locationAffectsAssignment(role) ? LOCATION_LIVE_HINT : LOCATION_INERT_HINT}
          </span>
        </label>
      </div>

      {portfolio ? (
        <p className="mt-3 text-xs text-slate-500">
          {role} has portfolio-wide access — no property assignment needed.
        </p>
      ) : (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-slate-500">Assigned properties</legend>
          <PropertyCheckboxes properties={properties} selected={propertyIds} onChange={setPropertyIds} />
        </fieldset>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
      >
        Create user
      </button>
    </form>
  );
}

/**
 * Properties cell. Collapses a full portfolio to "All N" rather than wrapping
 * eight short codes onto three lines — the single widest thing in the old
 * table. The full list stays available as a tooltip.
 */
function PropertyCell({
  user,
  total,
  shortCode,
}: {
  user: AdminUser;
  total: number;
  shortCode: (id: string) => string;
}) {
  if (isPortfolio(user.role)) {
    return (
      <span
        className="text-slate-400"
        title="Portfolio roles reach every property. Any rows on this account are kept but ignored."
      >
        Portfolio
      </span>
    );
  }
  const codes = user.propertyIds.map(shortCode).sort();
  if (codes.length === 0) return <span className="text-slate-400">—</span>;
  if (codes.length === total) return <span title={codes.join(", ")}>All {total}</span>;
  return <span title={codes.join(", ")}>{codes.join(", ")}</span>;
}

function UserRow({
  user,
  properties,
  shortCode,
  pending,
  assignableRoles,
  manageable,
  open,
  isSelf,
  onToggleOpen,
  onSetPw,
  onSetRole,
  onSetAssignable,
  onSetRemote,
  onReset,
  onUnlock,
  onToggleActive,
  onDelete,
  onSaveProps,
}: {
  user: AdminUser;
  properties: Prop[];
  shortCode: (id: string) => string;
  pending: boolean;
  assignableRoles: Role[];
  /** False when the actor may not act on this row (CORPORATE vs an ADMIN). */
  manageable: boolean;
  open: boolean;
  isSelf: boolean;
  onToggleOpen: () => void;
  onSetPw: (password: string) => void;
  onSetRole: (role: Role) => void;
  onSetAssignable: (assignable: boolean) => void;
  onSetRemote: (remote: boolean) => void;
  onReset: () => void;
  onUnlock: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onSaveProps: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(user.propertyIds);
  const [pw, setPw] = useState("");
  const portfolio = isPortfolio(user.role);
  // Changing your OWN role is refused server-side (an admin demoting themselves
  // with no second admin account is unrecoverable), so don't offer it either.
  const roleEditable = manageable && !isSelf;
  const locationLive = locationAffectsAssignment(user.role);
  const assignability = explainAssignability(
    user.role,
    user.remote,
    user.alwaysAssignable,
    user.propertyIds.length > 0,
  );

  return (
    <>
      <tr className={user.active ? "align-top" : "align-top opacity-60"}>
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900">{user.name}</div>
          <div className="text-xs text-slate-500">{user.email}</div>
          {/* Active and locked are independent: a locked account is still an
              active one, temporarily unable to sign in. Only the exceptions get
              a chip — an "Active" badge on 35 of 37 rows is noise, and its
              absence is what the greyed row already says. */}
          {(!user.active || user.locked || isSelf || user.alwaysAssignable) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {!user.active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  Inactive
                </span>
              )}
              {user.locked && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Locked{user.lockedUntil ? ` until ${formatInET(user.lockedUntil, "h:mm a")}` : ""}
                </span>
              )}
              {user.alwaysAssignable && (
                // Only the OVERRIDE gets a chip. "Assignable" on every
                // housekeeper would be noise — the role and location columns
                // already say that, and the exception is the thing worth
                // spotting from across the table.
                <span
                  className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                  title={assignability.reason}
                >
                  Assignable (override)
                </span>
              )}
              {isSelf && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  You
                </span>
              )}
            </div>
          )}
        </td>

        <td className="px-3 py-3">
          {roleEditable ? (
            <SelectField
              ariaLabel={`Role for ${user.email}`}
              value={user.role}
              onChange={(next) => {
                if (next === user.role) return;
                if (!confirm(`Change ${user.email} from ${user.role} to ${next}?`)) return;
                onSetRole(next as Role);
              }}
              options={roleOptions(user.role, assignableRoles)}
            />
          ) : (
            <span
              className="inline-block py-2 text-slate-600"
              title={
                isSelf
                  ? "You can't change your own role."
                  : "Only an ADMIN can manage an ADMIN account."
              }
            >
              {user.role}
            </span>
          )}
        </td>

        <td className="px-3 py-3">
          {manageable ? (
            <div
              className={locationLive ? undefined : "opacity-60"}
              title={locationLive ? LOCATION_LIVE_HINT : LOCATION_INERT_HINT}
            >
              <SelectField
                ariaLabel={`Location for ${user.email}`}
                value={user.remote ? "remote" : "onsite"}
                onChange={(next) => onSetRemote(next === "remote")}
                options={LOCATION_OPTIONS}
              />
            </div>
          ) : (
            <span className="inline-block py-2 text-slate-600">
              {user.remote ? "Remote" : "On-site"}
            </span>
          )}
        </td>

        <td className="px-3 py-3 text-xs text-slate-600">
          <PropertyCell user={user} total={properties.length} shortCode={shortCode} />
        </td>

        <td className="px-3 py-3 text-xs text-slate-500">
          {user.lastLoginAt ? (
            // Date only, full timestamp on hover. The old cell rendered
            // "Aug 26, 2026 3:35 PM ET" and wrapped it onto four lines.
            <span title={formatInET(user.lastLoginAt)}>
              {formatInET(user.lastLoginAt, "MMM d, yyyy").replace(/ ET$/, "")}
            </span>
          ) : (
            "Never"
          )}
        </td>

        <td className="px-4 py-3 text-right">
          {manageable ? (
            <div className="flex items-center justify-end gap-2">
              {/* Unlock stays on the row rather than inside the panel: it is the
                  one action someone hunts for under time pressure, and it only
                  renders on the handful of rows that need it. */}
              {user.locked && (
                <button
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                  disabled={pending}
                  onClick={onUnlock}
                >
                  Unlock
                </button>
              )}
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                disabled={pending}
                aria-expanded={open}
                onClick={onToggleOpen}
              >
                {open ? "Close" : "Manage"}
                <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            </div>
          ) : (
            <span
              className="text-xs text-slate-400"
              title="Only an ADMIN can manage an ADMIN account."
            >
              Admin only
            </span>
          )}
        </td>
      </tr>

      {open && manageable && (
        <tr>
          <td colSpan={6} className="border-l-2 border-navy bg-slate-50 px-4 py-4">
            <div className="flex flex-col gap-4">
              {/* Assignability sits at the top of the panel, and states the
                  CURRENT answer before offering the switch — the rule has three
                  inputs (role, location, property membership) and "why isn't
                  this person in the list" is not answerable from a bare
                  checkbox. The sentence comes from explainAssignability, which
                  is built on the same predicate the pool query mirrors. */}
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-700">
                      Assign to pool:{" "}
                      <span className={assignability.assignable ? "text-emerald-700" : "text-slate-500"}>
                        {assignability.assignable ? "included" : "not included"}
                      </span>
                    </div>
                    <p className="mt-0.5 max-w-xl text-xs text-slate-500">{assignability.reason}</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      className="size-4 accent-navy"
                      checked={user.alwaysAssignable}
                      disabled={pending}
                      onChange={(e) => onSetAssignable(e.target.checked)}
                    />
                    Always assignable
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  disabled={pending}
                  onClick={onReset}
                >
                  Reset password
                </button>
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  disabled={pending}
                  onClick={onToggleActive}
                >
                  {user.active ? "Deactivate" : "Reactivate"}
                </button>
                {!isSelf && (
                  <button
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                    disabled={pending}
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                )}
                {/* Says what the button does before it is pressed. "Reset PW"
                    alone did not convey that it replaces the password
                    immediately and shows the new one on screen rather than
                    emailing a link. */}
                <span className="text-xs text-slate-500">
                  Reset replaces the password now with a random one and shows it once above — nothing
                  is emailed.
                </span>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Set a specific password</span>
                  <input
                    type="text"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder={`min ${MIN_PASSWORD_LENGTH} characters`}
                    className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </label>
                <button
                  className="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
                  disabled={pending || pw.length < MIN_PASSWORD_LENGTH}
                  onClick={() => onSetPw(pw)}
                >
                  Set password
                </button>
              </div>

              {portfolio ? (
                <p className="text-xs text-slate-500">
                  {user.role} reaches every property — no assignment needed.
                </p>
              ) : (
                <div>
                  <div className="text-xs font-medium text-slate-500">Assigned properties</div>
                  <PropertyCheckboxes properties={properties} selected={draft} onChange={setDraft} />
                  <button
                    className="mt-2 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
                    disabled={pending}
                    onClick={() => onSaveProps(draft)}
                  >
                    Save assignments
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PropertyCheckboxes({
  properties,
  selected,
  onChange,
}: {
  properties: Prop[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {properties.map((p) => (
        <label
          key={p.id}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
            selected.includes(p.id) ? "border-slate-900 bg-navy text-white" : "border-slate-300 text-slate-600"
          }`}
        >
          <input type="checkbox" className="hidden" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
          {p.shortCode}
        </label>
      ))}
    </div>
  );
}
