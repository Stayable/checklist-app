// UniFi console → Property registry (T11, 2026-07-27).
//
// The Site Manager cloud API tells us which consoles exist but NOT which
// RISE8 property each one belongs to — no vendor payload carries "4645". That
// mapping is ours to own, and this file is it.
//
// Two flagged problems are enforced here by construction rather than by
// remembering to check them downstream:
//
//   N2 (untrusted console views) — monitoring is EXPLICIT OPT-IN. A console
//   absent from this registry, or present with `monitored: false`, is never
//   polled. Four entries are excluded because the account that reports them
//   has a stale view: ingesting them would manufacture permanent "outages"
//   nobody can clear. They are LISTED with `monitored: false` on purpose, so
//   the exclusion is visible and auditable rather than silently missing.
//
//   ⚠ Host ids are ACCOUNT-SCOPED, not global (discovered 2026-07-29). The
//   same physical console seen through two accounts yields two different ids
//   that share a MAC-derived prefix and differ after the ":". Orlando is the
//   worked example below. So this registry maps (console, account) pairs, and
//   dedup-by-id across keys cannot collapse them — which is fine precisely
//   because monitoring is opt-in: only the trustworthy view is turned on.
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
 * Consoles visible across the configured keys — 14 of the estate's ~19 as of
 * 2026-07-29, spread over TWO Ubiquiti accounts (see N1).
 *
 * Monitored: Kissimmee West, Lakeland, Kissimmee East, Orlando OBT, Davenport.
 * STILL MISSING (no key reaches them): **Jacksonville West** and **Jacksonville
 * North**, plus a live St. Augustine console — only its stale view is visible.
 */
export const UNIFI_HOST_REGISTRY: readonly UnifiHostEntry[] = [
  {
    hostId: "D021F975B84700000000064ABD90000000000695A06F00000000620E7083:428824983",
    label: "SS-KISSWEST",
    propertyRef: "5399", // Kissimmee West (KW)
    monitored: true,
    note: "Live pilot console (Kyle 2026-07-27) — the one production console this key can read.",
  },

  {
    hostId: "D021F959BF0700000000063D263D00000000068724A30000000061C908A1:698881875",
    label: "Lakeland",
    propertyRef: "4645", // Lakeland (LL) — Network side
    monitored: true,
  },
  {
    hostId: "AC8BA96B5E6800000000071A736B000000000770254C00000000639C7710:2137493819",
    label: "Lakeland-NVR",
    propertyRef: "4645", // Lakeland (LL) — Protect / cameras
    monitored: true,
  },
  {
    hostId: "70A74166934C00000000066D640F0000000006BA5304000000006288B335:725861524",
    label: "SS-KISSEAST",
    propertyRef: "2295", // Kissimmee East (KE) — Network side
    monitored: true,
  },
  {
    hostId: "1C6A1B4A723A0000000008CE3C99000000000946AC230000000067C56B3A:1561236543",
    label: "KE-NVR",
    propertyRef: "2295", // Kissimmee East (KE) — Protect / cameras
    monitored: true,
  },
  {
    hostId: "70A741665E6C00000000066E2D4D0000000006C0415D00000000629B6398:105822277",
    label: "SS-ORLANDO (live)",
    propertyRef: "8700", // Orlando OBT (OR) — Network side
    monitored: true,
    note: "Same physical console as the ':1068319892' entry below — identical MAC prefix, different account-scoped id suffix. THIS is the trustworthy view (connected); the other account sees it stale.",
  },
  {
    hostId: "1C6A1B4A70180000000008CF6762000000000947E73D0000000067C6D928:1821572390",
    label: "Orlando-NVR",
    propertyRef: "8700", // Orlando OBT (OR) — Protect / cameras
    monitored: true,
  },
  {
    hostId: "74FA29252E800000000009F4DC1D000000000A8328390000000069BE3E69:907048078",
    label: "Orlando-NVR2",
    propertyRef: "8700", // Orlando OBT (OR) — Protect / cameras (second recorder)
    monitored: true,
  },
  {
    hostId: "1C6A1B2320710000000008C15EEF0000000009391CBF0000000067B2D815:1927523536",
    label: "UDM-Pro-Devenport",
    propertyRef: "44199", // Davenport (DP) — Network side
    monitored: true,
  },
  {
    hostId: "58D61F534F9500000000099C64A4000000000A23DEA60000000069160102:193461564",
    label: "Davenport-NVR",
    propertyRef: "44199", // Davenport (DP) — Protect / cameras
    monitored: true,
  },

  // ── Untrusted views — N2. Never poll these. ─────────────────────────────
  //
  // CORRECTION 2026-07-29: these were originally labelled "decommissioned
  // hardware". The Orlando evidence above disproves that for at least one of
  // them — the same physical console (same MAC prefix) reports `disconnected`
  // through the first account and `connected` through the second, so what is
  // stale is the ACCOUNT'S VIEW, not the hardware. JAXWEST and StAugustine are
  // very likely the same story; the second key simply cannot see them either,
  // so it remains unproven. Either way they stay unmonitored: an account whose
  // view of a console is stale is not a source we can trust.
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
    note: "SAME PHYSICAL CONSOLE as the ':105822277' entry above (identical MAC prefix) — not separate hardware. This account's view of it is stale; the other account sees it connected with 15 devices. Kept unmonitored so the stale view can never win.",
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
