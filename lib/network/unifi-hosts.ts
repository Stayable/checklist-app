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
 * Consoles visible across the configured keys.
 *
 * ✅ N1 CLOSED 2026-07-31. Three per-fabric keys (CENTRAL / INDEPENDENT / NORTH)
 * return **20 host entries with no id overlap** — 16 real consoles plus the 4
 * known-stale views kept excluded below. Every property is covered and nothing
 * in this registry is unreachable any more.
 *
 *   CENTRAL      9 hosts — Lakeland, Kissimmee East, Orlando OBT, Davenport
 *   INDEPENDENT  5 hosts — Kissimmee West + the 4 stale views
 *   NORTH        6 hosts — Jacksonville North, Jacksonville West, St. Augustine
 *
 * Monitored: all 8 properties, 16 consoles, ~640 devices.
 *
 * Two earlier conclusions the three-fabric evidence overturned:
 *   • **N5 was wrong** — Jacksonville North HAS a Network console
 *     (`SS-Jax-North`, 8 devices). It was invisible, not absent.
 *   • Host ids are account-scoped but **stable across keys within an account**:
 *     rotating CENTRAL's key returned byte-identical ids, so a key rotation
 *     does not invalidate this registry.
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

  // ── NORTH fabric (added 2026-07-31) — the three properties no earlier key
  //    could reach. All six were `connected` on first sight.
  {
    hostId: "74FA291A02890000000009EED22E000000000A7CC9350000000069B50B68:993936950",
    label: "SS-Jax-North",
    propertyRef: "812", // Jacksonville North (JN) — Network side
    monitored: true,
    note: "Disproves N5 ('JN has no Network console'). It exists — 8 devices — it was simply invisible to the CENTRAL and INDEPENDENT keys.",
  },
  {
    hostId: "1C6A1B29274C0000000008C01724000000000937C7FF0000000067B0B52F:1938202913",
    label: "JN-NVR1",
    propertyRef: "812", // Jacksonville North (JN) — Protect / cameras
    monitored: true,
  },
  {
    hostId: "1C6A1B2911500000000008C721B000000000093F2F8E0000000067BA80FD:1937848973",
    label: "JN-NVR2",
    propertyRef: "812", // Jacksonville North (JN) — Protect / cameras (second recorder)
    monitored: true,
  },
  {
    hostId: "6C63F8A2CC55000000000937A6070000000009B6831D00000000685415A3:1910034835",
    label: "UDM-Pro-Jax-West",
    propertyRef: "6802", // Jacksonville West (JW) — Network side
    monitored: true,
    note: "The live replacement for the cloud-dead 'SS-JAXWEST' UCK G2 Plus below. 13 devices vs the legacy console's 14 stale ones — consistent with a like-for-like swap.",
  },
  {
    hostId: "0CEA146EA8DD00000000088154C80000000008F56F5200000000673AAF30:206129026",
    label: "SS-ST-AUGUSTINE",
    propertyRef: "2535", // St. Augustine (SA) — Network side
    monitored: true,
    note: "The live console. Carries the same 48 devices the dead 'SS-St-Augustine' UCG Ultra below still reports as offline — same fleet, re-adopted onto new hardware. Monitoring the live one and excluding the stale one is what keeps 48 phantom outages out of the ticket queue.",
  },
  {
    hostId: "1C6A1B4A72430000000008CE38D1000000000946A81D0000000067C56752:1156633491",
    label: "St-Augustine-NVR",
    propertyRef: "2535", // St. Augustine (SA) — Protect / cameras
    monitored: true,
  },

  // ── Untrusted views — N2. Never poll these. ─────────────────────────────
  //
  // CORRECTION 2026-07-29: these were originally labelled "decommissioned
  // hardware". The Orlando evidence above disproves that for at least one of
  // them — the same physical console (same MAC prefix) reports `disconnected`
  // through the first account and `connected` through the second, so what is
  // stale is the ACCOUNT'S VIEW, not the hardware.
  //
  // RESOLVED 2026-07-31, and it is BOTH stories at once. All four live in the
  // INDEPENDENT fabric and all four still report `disconnected`:
  //   • SS-ORLANDO is a stale VIEW — the same console is `connected` in CENTRAL.
  //   • SS-JAXWEST and SS-St-Augustine are genuinely dead HARDWARE — their live
  //     replacements now appear in the NORTH fabric above, as separate consoles
  //     with different MAC prefixes.
  // Every one stays unmonitored. Ingesting them would manufacture 63 phantom
  // offline devices (14 + 1 + 48) at properties that are actually healthy.
  {
    hostId: "F492BF95B8FB00000000051B1C510000000005563736000000005F904DFE:1235846273",
    label: "SS-JAXWEST",
    propertyRef: "6802",
    monitored: false,
    note: "Legacy UCK G2 Plus, cloud-disconnected since 2025-11-14. Dead hardware — its live replacement 'UDM-Pro-Jax-West' is registered above (NORTH fabric, confirmed 2026-07-31). Its 14 devices all report offline: stale, not down.",
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
    note: "Legacy UCG Ultra, cloud-disconnected since 2025-12-12. Dead hardware — replaced by 'SS-ST-AUGUSTINE', registered above (NORTH fabric, confirmed 2026-07-31). Reports the same 48 devices as the live console, all offline: stale, not down.",
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

/**
 * Display label for the console a device is reported by.
 *
 * Falls back to a truncated host id for a console that is no longer registered
 * — a device row keeps whichever console last reported it, and showing a stub
 * id is more honest than a blank that reads as "no console".
 */
export function consoleLabel(hostId: string | null | undefined): string {
  if (!hostId) return "—";
  return findHostEntry(hostId)?.label ?? `${hostId.slice(0, 12)}…`;
}

/** Monitored consoles as filter options, grouped sensibly for a <select>. */
export function consoleOptions(
  registry: readonly UnifiHostEntry[] = UNIFI_HOST_REGISTRY,
): { hostId: string; label: string }[] {
  return monitoredHosts(registry)
    .map((e) => ({ hostId: e.hostId, label: e.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
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
