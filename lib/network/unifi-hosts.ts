// UniFi console → Property registry (T11, 2026-07-27).
//
// The Site Manager cloud API tells us which consoles exist but NOT which
// RISE8 property each one belongs to — no vendor payload carries "4645". That
// mapping is ours to own, and this file is it.
//
// Two flagged problems are enforced here by construction rather than by
// remembering to check them downstream:
//
//   N2 (decommissioned consoles) — monitoring is EXPLICIT OPT-IN. A console
//   absent from this registry, or present with `monitored: false`, is never
//   polled. Four consoles in the account are replaced hardware that has been
//   cloud-disconnected for 8-14 months; ingesting them would manufacture
//   permanent "outages" that no one can ever clear. They are listed below
//   with `monitored: false` on purpose — listed, so the exclusion is visible
//   and auditable, rather than silently missing.
//
//   N3 (multiple consoles per property) — this is a flat list keyed by host,
//   not a column on Property, so one property can own any number of consoles
//   (a Network gateway plus one or two Protect NVRs; Orlando has three).
//
// Why a code constant and not a DB table: the mapping changes only when
// hardware changes, it needs no runtime mutation, and a table would need an
// admin UI to be useful. Promote it to `UnifiHost` rows when a non-developer
// needs to edit it — the shape here maps 1:1 onto a table.
//
// `propertyRef` is `Property.propertyId` (the RISE8 id, e.g. "5399"), which
// is what lib/network/ingest.server.ts resolves against.

export type UnifiHostEntry = {
  /** Full Site Manager host id, exactly as returned by GET /v1/hosts. */
  hostId: string;
  /** Console name as it appears in Site Manager — for logs and admin display. */
  label: string;
  /** Property.propertyId, or null when the console isn't a property console. */
  propertyRef: string | null;
  /** Explicit opt-in. False = never polled, never ingested. */
  monitored: boolean;
  /** Why this entry is excluded, or anything else a future reader needs. */
  note?: string;
};

/**
 * Every console this account can currently see (5 of the estate's 19 — the
 * key's account is not invited to the other 14; see N1). Add the rest once
 * that access lands: one entry per console, `monitored: true`, correct
 * `propertyRef`.
 */
export const UNIFI_HOST_REGISTRY: readonly UnifiHostEntry[] = [
  {
    hostId: "D021F975B84700000000064ABD90000000000695A06F00000000620E7083:428824983",
    label: "SS-KISSWEST",
    propertyRef: "5399", // Kissimmee West (KW)
    monitored: true,
    note: "Live pilot console (Kyle 2026-07-27) — the one production console this key can read.",
  },

  // ── Decommissioned / replaced hardware — N2. Never poll these. ───────────
  {
    hostId: "F492BF95B8FB00000000051B1C510000000005563736000000005F904DFE:1235846273",
    label: "SS-JAXWEST",
    propertyRef: "6802",
    monitored: false,
    note: "Legacy UCK G2 Plus, cloud-disconnected since 2025-11-14. Replaced by 'UDM Pro Jax West' (not visible to this key). Its 14 devices all report offline — stale, not down.",
  },
  {
    hostId: "70A741665E6C00000000066E2D4D0000000006C0415D00000000629B6398:1068319892",
    label: "SS-ORLANDO (legacy duplicate)",
    propertyRef: "8700",
    monitored: false,
    note: "Cloud-disconnected since 2025-05-25; reports only its own UDM Pro. A separate live 'SS-ORLANDO' console exists outside this key's access.",
  },
  {
    hostId: "9C05D669EAE40000000007FD38F9000000000869AB820000000066036BBB:207126036",
    label: "SS-StAugustine",
    propertyRef: "2535",
    monitored: false,
    note: "Legacy UCG Ultra, cloud-disconnected since 2025-12-12. All 48 devices report offline — stale. Replaced by 'SS- ST AUGUSTINE'.",
  },
  {
    hostId: "49a2a116-b82b-4b9f-87c8-926fe33bb407",
    label: "Unifi Hosting - admin",
    propertyRef: null,
    monitored: false,
    note: "Hosted UniFi controller (the only console this account owns). Not a property; nothing guest- or ops-facing depends on it.",
  },
] as const;

/** Entries the poller is allowed to touch: opted in AND tied to a property. */
export function monitoredHosts(
  registry: readonly UnifiHostEntry[] = UNIFI_HOST_REGISTRY,
): UnifiHostEntry[] {
  return registry.filter((entry) => entry.monitored && entry.propertyRef !== null);
}

export function findHostEntry(
  hostId: string,
  registry: readonly UnifiHostEntry[] = UNIFI_HOST_REGISTRY,
): UnifiHostEntry | null {
  return registry.find((entry) => entry.hostId === hostId) ?? null;
}

/** All consoles registered to one property (N3: may be more than one). */
export function hostsForProperty(
  propertyRef: string,
  registry: readonly UnifiHostEntry[] = UNIFI_HOST_REGISTRY,
): UnifiHostEntry[] {
  return registry.filter((entry) => entry.propertyRef === propertyRef);
}

/**
 * True iff this host id may be ingested. Everything unknown to the registry
 * is rejected — a console appearing in the API for the first time (new
 * hardware, or newly granted access) must be registered deliberately, not
 * monitored implicitly.
 */
export function isMonitoredHost(
  hostId: string,
  registry: readonly UnifiHostEntry[] = UNIFI_HOST_REGISTRY,
): boolean {
  const entry = findHostEntry(hostId, registry);
  return entry !== null && entry.monitored && entry.propertyRef !== null;
}
