# Contractor update fan-out — pipeline-side handoff

**From:** `rise8-ops-platform` (the checklist app). The receiver is **built and live in production**.
**To:** `construction_updates` (the WhatsApp voice pipeline, Azure Function).
**Date:** 08/13/26.
**Governed by:** `ContractorUpdateFanout_Contract_081226.md`, owned by `construction_updates`. This
document does **not** amend it. Where this and the contract disagree, the contract wins and this file
is wrong — say so.

This is the mirror of `ContractorUpdateFanout_HandoffPrompt_081226.md`, which briefed the app side.
That brief could not describe an app that did not exist yet. This one describes the app that now does.

> ## This is the CANONICAL copy. A mirror sits in `construction_updates`.
>
> Mirrored to `C:\Users\Kyle Estocapio\Git-Claude\construction_updates\` on 08/13/26 at commit
> `f54b2e6`, on Kyle's instruction, so a session in that repo detects it without being handed a path.
> **That copy carries a do-not-edit banner. Change this one, then refresh it.**
>
> Note the ownership is the reverse of the contract's: `construction_updates` owns the *contract*
> and this repo mirrors it; this repo owns *this* document — it describes the receiver — and that
> repo mirrors it. Each artifact is owned by the side that can actually verify what it says.

---

## 1. Paste-in prompt

Paste the block below into a Claude Code session opened in
`C:\Users\Kyle Estocapio\Git-Claude\construction_updates`.

---

Read `ContractorUpdateFanout_Contract_081226.md` in full first. It is the wire contract, this repo
owns it, and it governs both sides. Then read `ContractorUpdateFanout_PipelineHandoff_RISE8_081326.md`
— the receiving app is already built, deployed and verified, so the wire is fixed and your job is to
match it exactly, not to design it.

Your scope is **this repo's half only: the outbound call.** The receiver is not yours and is done.

Build, in this order:

1. The POST into `azure/function_app.py`, placed **third**: `update_row → attach_to_row → POST →
   add_row_comment`. Same on the image path (`_handle_image`) and the flag path (`_flag`). The
   ordering is load-bearing — see §4 below.
2. The app setting + Key Vault reference (§3). The secret is already stored; only the reference is
   missing.
3. Tests: a signed request that the receiver accepts, a duplicate `messageSid`, and a payload for a
   contractor with no job that day.
4. `proto/replay.py` support so a known message can be re-sent at will (§7).

**Non-goals — do not do these:**
- Do not set `CHECKLIST_APP_URL` until §7's proof passes. Unset is the kill switch and the default.
- Do not send raw audio or image bytes. Blob URLs only (contract §6).
- Do not make the call best-effort-and-silent. It must be able to raise — that is the entire reason
  it sits before the Smartsheet comment.
- Do not create jobs, and do not expect the app to. An update with no matching job is filed against
  the day, by design.
- Do not edit the checklist-app repo.

Report: what you built, test output verbatim, and anything in this handoff that does not match what
the receiver actually does.

---

## 2. What is live on the app side, verified

Deployed 08/13/26 (`checklist-g1hx1vlk4`), migration applied to production first.

| | |
|---|---|
| Endpoint | `POST https://ops.rentstayable.com/api/webhooks/contractor-update` |
| Auth | HMAC-SHA256 over the **raw request body**, header `x-webhook-signature` |
| Secret | Key Vault `kv-stayable-wa6929` → `checklist-app-webhook-secret` (**already set**, fingerprint `ec1200b3859d`) |
| Fail-closed | an unset secret on the app side rejects every request in production |
| `contractVersion` | **1** — anything else is rejected (200, `unsupported_version`) |

Verified live over HTTPS: unsigned POST → **401**, wrong signature → **401**, non-JSON → **400**,
and three probes wrote three capture rows with **zero** applied rows.

**Contractor identity is ready.** All **13** contractors now carry phone + WhatsApp numbers, loaded
from this repo's own `proto/roster.csv`. The app matches on **normalized digits** — non-digits
stripped, a leading US `1` dropped — so E.164 from your side matches whatever a human typed on ours.
Name matching exists only as a fallback and is exact-string; do not rely on it.

---

## 3. The secret

Already in the vault. What is missing is only the app-setting reference:

```
CHECKLIST_APP_WEBHOOK_SECRET=@Microsoft.KeyVault(SecretUri=https://kv-stayable-wa6929.vault.azure.net/secrets/checklist-app-webhook-secret)
```

⚠ **Versionless URI.** Three superseded versions of that secret are disabled; a version-pinned URI
would resolve to one of them and every request would 401.

---

## 4. The call

### Signing

Sign **the exact bytes you send**, not a re-serialized copy. Build the body once, sign that string,
post that string. A re-`json.dumps()` between signing and sending changes key order or spacing and
the signature fails with a 401 that looks like a wrong secret.

```python
import hmac, hashlib, json, requests

body = json.dumps(payload, ensure_ascii=False).encode("utf-8")   # build ONCE
sig  = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

resp = requests.post(
    f"{checklist_app_url}/api/webhooks/contractor-update",
    data=body,                                                    # send the SAME bytes
    headers={
        "content-type": "application/json; charset=utf-8",
        "x-webhook-signature": f"sha256={sig}",                   # bare hex also accepted
    },
    timeout=10,
)
```

The `sha256=` prefix is optional — the app strips it if present. Comparison is constant-time and any
malformed signature is rejected rather than throwing.

### Placement, and why it is not negotiable

```
update_row  →  attach_to_row  →  POST /api/webhooks/contractor-update  →  add_row_comment
```

`update_row` is an overwrite and `attach_to_row` is idempotent, so both survive a re-run for free.
`add_row_comment` does **not**. With the post before the comment, a failed post can **raise** and let
the queue re-run the whole message — the only backoff long enough to outlast a wobble — without ever
double-posting a Smartsheet comment.

**The app is built to make this safe.** Duplicates are free: `messageSid` is a unique constraint, and
a repeat returns `200 {"ok":true,"duplicate":true}` having written nothing. So a re-run costs one
wasted HTTP call, never a doubled note or a doubled status change.

Timeout 10 s, then raise.

---

## 5. Responses, and what each one means

**Every non-crash outcome is 200.** That is deliberate: Twilio retries anything that is not 2xx, so a
4xx for "we could not map this" would be retried forever for a payload that will never map. Do not
treat a 200 as proof the update landed on a job — read `resolution`.

| Status | Body | Meaning | Your action |
|---|---|---|---|
| 200 | `{"ok":true,"duplicate":false,"resolution":"JOB_STATUS","jobId":…,"matchedBy":"phone"}` | Landed on a job, status changed | done |
| 200 | `…"resolution":"JOB_NOTE"…` | Landed on a job, note only (no status sent, unchanged, or job already closed) | done |
| 200 | `…"resolution":"DAILY_NOTE","jobId":null` | **No job matched.** Filed against the day | log it — see §6 |
| 200 | `…"resolution":"AMBIGUOUS"` | Two jobs for that contractor that day; nothing attached, both ids named in the note | log it; a human files it |
| 200 | `{"ok":true,"duplicate":true}` | Already applied. Nothing written | done, do not retry |
| 200 | `{"ok":false,"reason":"unsupported_version","version":N}` | Your deploy is ahead of the app's | alert; do not retry |
| 200 | `{"ok":false,"reason":"invalid_payload","detail":…}` | Failed Zod at the boundary | alert; do not retry — it will never pass |
| 401 | `{"ok":false,"reason":"invalid_signature"}` | Bad or missing signature | **raise** — worth retrying once the secret is right |
| 400 | `{"ok":false,"reason":"invalid_json"}` | Body was not JSON | raise; a bug on your side |

`matchedBy` is `"phone"`, `"name"`, or `null`. **A run of `"name"` values is a warning**: it means the
phone did not match and the app fell back to exact-name matching, which the contract itself calls
unsafe. Worth an alert if it ever appears.

---

## 6. What decides whether an update reaches the calendar

Three things must all be true, or it becomes a `ContractorDailyNote` and the calendar looks
untouched. Nothing errors.

1. **The sender's number matches a contractor** — true today for all 13.
2. **A job exists for that contractor on that ET `workDate`** — see the warning below.
3. **That job is not already `DONE`/`CANCELLED`** — a closed job stays closed, the conflict is
   recorded in the note. This is ADR-030's invariant on the app side and mirrors your own
   never-downgrade-`Completed` rule.

> ### ⚠ The plan load is still manual, and it is the likeliest way this quietly fails
>
> The fan-out **never creates a job** (contract §7). Jobs reach the calendar only through the app's
> Smartsheet snapshot loader, which a human still runs. **After your Monday `rollover_schedule.py`,
> if the new week has not been loaded into the app, every update that week resolves to
> `DAILY_NOTE`.** The board looks empty and nothing alerts.
>
> This is contract §9.4 — fan out the rollover too — and it is explicitly out of v1 scope. Until it
> exists, the Monday load is a standing chore, not an edge case.

---

## 7. Proving it

The contract's §10 says prove against a preview deploy first. ⚠ **That path is not currently
available:** the app's Preview environment has no `CONTRACTOR_UPDATE_SECRET` and points at a dev
database that has been unreachable since early August.

Two honest options:

- **(a) Fix Preview first** — add the secret to the Preview scope and restore the dev DB. Truest to
  the contract, and slower.
- **(b) One controlled replay against production**, aimed at a job chosen in advance. **Recommended.**
  The blast radius is one append-only note on one known job, and the app side can read it back
  immediately. If it is wrong it is identifiable and harmless.

Either way the sequence is unchanged:

1. Send one known message with `CHECKLIST_APP_URL` set **only for that run**.
2. The app side confirms the note appears on the expected job, and that `resolution` is `JOB_STATUS`
   or `JOB_NOTE` — **not** `DAILY_NOTE`.
3. Then set `CHECKLIST_APP_URL` permanently and watch one real crew message end to end.
4. Run **one full week including a Monday rollover** before anything in §10.6 is removed. The
   rollover is the only thing that proves the app is not keying on `smartsheetRowId`.

**Verify by reading the job's notes, not by the absence of an alert.** Silence looks exactly like
success from the outside — that is the failure shape this whole design is arranged against.

---

## 8. Three deviations from the contract, decided on the app side

Flagged because the contract text still describes the original plan, and a reader of §4 or §8 alone
would expect something different.

1. **Capture does not go to `RawWebhookPayload` (§4).** That table's `source` column is the *device*
   enum `DeviceSource` (`UNIFI_PROTECT | UNIFI_NETWORK | ARUBA`); a contractor update is not a device
   source, and widening it would put a non-device value in front of every network device filter. The
   fan-out has its own capture table. **The discipline is unchanged** — the raw body is persisted
   before parsing and before the signature is trusted.
2. **The idempotency key is on a separate row from the capture (§5).** A unique `messageSid` on the
   capture row would throw on the *second* delivery of a retried message before any code could decide
   it was a duplicate — a 500 exactly when Twilio is retrying. Capture is unconstrained; the applied
   row carries the unique key and is written in the same transaction as its effects.
3. **§8.1 overstates one task:** there is no per-status colour map on the calendar to extend. It
   renders a status label and branches on terminal/overdue only.

Both (1) and (2) are app-internal and change nothing on the wire.

---

## 9. What the app side still owes

Stated so nobody assumes it is done:

- **ADR-031 is not written.** The handoff brief asked for it first; it is outstanding.
- **No route-level integration tests.** The 41 new tests cover the pure decision layer — payload
  validation, status mapping, job resolution, terminal immutability, ambiguity, the note body. The
  route wiring itself is covered only by a build and three live probes.
- **The app was deployed to production**, whereas the app-side brief said preview only. That was
  Kyle's explicit call on 08/13 after the migration/deploy sequence was laid out. It is safe in the
  sense that nothing can reach the route until you set `CHECKLIST_APP_URL` — but it does mean the
  contract's "prove on preview first" step now has to be read as §7(b) above.
- **Nothing has ever been received.** No real payload, no browser has opened any of this.

---

## 10. Open, and not decided by either side

- **`Boca Condo`** — a row Gerardo schedules at a location with no `Property` in the app. No job can
  exist, so no update can anchor to one. It is a *plan* problem, belongs to §9.4, and was 30 of 65
  rows on 08/03 and 0 on 08/10. Do not invent a property for it.
- **P30 — who owns the Azure Function.** The contract calls this the real risk, and it has now
  surfaced in a fifth place: secret rotation for this integration. A handover to a *project* is not a
  handover to a *person*.
