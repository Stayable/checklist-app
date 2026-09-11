"use client";

import { SelectField } from "@/components/ui/select";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Locale, Role } from "@prisma/client";
import { formatInET } from "@/lib/datetime";
import { canAdministerUser, locationAffectsAssignment } from "@/lib/roles";

// Mirror of MIN_PASSWORD_LENGTH in lib/password.ts (kept local so this client
// bundle doesn't import the server-only crypto module). Server re-validates.
const MIN_PASSWORD_LENGTH = 8;
import {
  createUser,
  deleteUser,
  resetPassword,
  setUserActive,
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
  active: boolean;
  lastLoginAt: string | null;
  /** Inside an active failed-login lockout as of server render (ADR-008). */
  locked: boolean;
  lockedUntil: string | null;
  propertyIds: string[];
};

type Prop = { id: string; shortCode: string; name: string };

const isPortfolio = (r: Role) => r === Role.CORPORATE || r === Role.ADMIN;

// The role list is NOT hard-coded here any more: it arrives as `assignableRoles`
// from the server, already filtered by what the signed-in actor may grant (a
// CORPORATE actor never sees ADMIN). The old local list also omitted AGENT and
// NETWORK_TECH, so those rows had no option matching their own value.
const LOCATION_LABEL = (remote: boolean) => (remote ? "Remote" : "On-site");

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
  const [editing, setEditing] = useState<string | null>(null);
  const [pwFor, setPwFor] = useState<string | null>(null);

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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Properties</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
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
                // the same predicate used to avoid offering a button that would
                // only come back refused.
                manageable={canAdministerUser(actorRole, u.role)}
                editing={editing === u.id}
                settingPw={pwFor === u.id}
                isSelf={u.id === currentUserId}
                onToggleEdit={() => setEditing(editing === u.id ? null : u.id)}
                onToggleSetPw={() => setPwFor(pwFor === u.id ? null : u.id)}
                onSetPw={(pw) =>
                  run(async () => {
                    const res = await setUserPassword(u.id, pw);
                    if (res.ok) setPwFor(null);
                    return res;
                  })
                }
                onSetRole={(role) => run(() => setUserRole({ userId: u.id, role }))}
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
                    if (res.ok) setEditing(null);
                    return res;
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
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
  const input = "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, email, role, locale, remote, propertyIds });
      }}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <input className={input} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className={input} type="email" placeholder="work@rentstayable.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <SelectField
          ariaLabel="Role"
          value={role}
          onChange={(next) => setRole(next as Role)}
          options={assignableRoles.map((r) => ({ value: r, label: r }))}
        />
        <SelectField
          ariaLabel="Language"
          value={locale}
          onChange={(next) => setLocale(next as Locale)}
          options={[
            { value: Locale.en, label: "English" },
            { value: Locale.es, label: "Spanish" },
          ]}
        />
        <SelectField
          ariaLabel="Location"
          value={remote ? "remote" : "onsite"}
          onChange={(next) => setRemote(next === "remote")}
          options={[
            { value: "onsite", label: "On-site" },
            { value: "remote", label: "Remote" },
          ]}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {locationAffectsAssignment(role)
          ? "Location drives the “Assign to” pool — a Remote manager is not offered room-level work."
          : "Location is recorded for reference. It only changes the “Assign to” pool for MANAGER."}
      </p>

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

function UserRow({
  user,
  properties,
  shortCode,
  pending,
  assignableRoles,
  manageable,
  editing,
  settingPw,
  isSelf,
  onToggleEdit,
  onToggleSetPw,
  onSetPw,
  onSetRole,
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
  editing: boolean;
  settingPw: boolean;
  isSelf: boolean;
  onToggleEdit: () => void;
  onToggleSetPw: () => void;
  onSetPw: (password: string) => void;
  onSetRole: (role: Role) => void;
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
  const action = "text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40";
  // Changing your OWN role is refused server-side (an admin demoting themselves
  // with no second admin account is unrecoverable), so don't offer it either.
  const roleEditable = manageable && !isSelf;

  return (
    <>
      <tr className={user.active ? "" : "opacity-50"}>
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900">{user.name}</div>
          <div className="text-xs text-slate-500">{user.email}</div>
        </td>
        <td className="px-4 py-3">
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
            <span title={isSelf ? "You can't change your own role." : "Only an ADMIN can manage an ADMIN account."}>
              {user.role}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          {manageable ? (
            <SelectField
              ariaLabel={`Location for ${user.email}`}
              value={user.remote ? "remote" : "onsite"}
              onChange={(next) => onSetRemote(next === "remote")}
              options={[
                { value: "onsite", label: "On-site" },
                { value: "remote", label: "Remote" },
              ]}
            />
          ) : (
            <span className="text-xs text-slate-600">{LOCATION_LABEL(user.remote)}</span>
          )}
          {!locationAffectsAssignment(user.role) && (
            // Say so rather than hiding the control: a hidden field is a fact
            // you cannot correct, but a silently inert one is worse.
            <div className="mt-0.5 text-[11px] text-slate-400">reference only</div>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-slate-600">
          {portfolio ? <span className="text-slate-400">Portfolio</span> : user.propertyIds.map(shortCode).join(", ") || "—"}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {user.lastLoginAt ? formatInET(user.lastLoginAt) : "Never"}
        </td>
        <td className="px-4 py-3">
          {/* Active and locked are independent: a locked account is still an
              active one, temporarily unable to sign in. Show both. */}
          <div className="flex flex-col items-start gap-1">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {user.active ? "Active" : "Inactive"}
            </span>
            {user.locked && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                Locked{user.lockedUntil ? ` until ${formatInET(user.lockedUntil, "h:mm a")}` : ""}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-3">
            {!manageable && (
              <span className="text-xs text-slate-400">Admin only</span>
            )}
            {manageable && user.locked && (
              <button
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-40"
                disabled={pending}
                onClick={onUnlock}
              >
                Unlock
              </button>
            )}
            {manageable && (
              <button className={action} disabled={pending} onClick={onReset}>Reset PW</button>
            )}
            {manageable && (
              <button className={action} disabled={pending} onClick={onToggleSetPw}>
                {settingPw ? "Close" : "Set PW"}
              </button>
            )}
            {manageable && !portfolio && (
              <button className={action} disabled={pending} onClick={onToggleEdit}>
                {editing ? "Close" : "Properties"}
              </button>
            )}
            {manageable && (
              <button className={action} disabled={pending} onClick={onToggleActive}>
                {user.active ? "Deactivate" : "Reactivate"}
              </button>
            )}
            {manageable && !isSelf && (
              <button
                className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-40"
                disabled={pending}
                onClick={onDelete}
              >
                Delete
              </button>
            )}
          </div>
        </td>
      </tr>
      {editing && !portfolio && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-4 py-3">
            <PropertyCheckboxes properties={properties} selected={draft} onChange={setDraft} />
            <button
              className="mt-2 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
              disabled={pending}
              onClick={() => onSaveProps(draft)}
            >
              Save assignments
            </button>
          </td>
        </tr>
      )}
      {settingPw && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder={`New password (min ${MIN_PASSWORD_LENGTH} chars)`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button
                className="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
                disabled={pending || pw.length < MIN_PASSWORD_LENGTH}
                onClick={() => onSetPw(pw)}
              >
                Set password
              </button>
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
