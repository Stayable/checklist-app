# Checklist Team Interview Guide — RISE8 Operations Platform

**Purpose:** Structured agenda for the requirements / QoL session with the people who do checklists today (field staff, PMs, Karla, Christopher). This one meeting can close four open project blockers — don't leave without them.
**Prepared:** June 5, 2026 · Build status: Phase 4 alpha (filling + review + issues working; photos/emails partially wired)

---

## 0. Setup (before the meeting)

- [ ] Have the alpha running and logged in on a phone (`/` Today view) and a laptop (`/review`, `/issues`) — react to real screens, not descriptions
- [ ] Have Connecteam open side-by-side for comparison
- [ ] One note-taker per section below; tag every item NEEDED / NOT NEEDED / QOL

---

## 1. BLOCKER — Real question content per template *(owner: Karla / Christopher)*

The build has all 9 templates with **placeholder questions**. Go-live is impossible without the real sets.

For each template, capture: exact question text (EN), answer type, required?, photo required?, which Fail answers should auto-create an Issue:

| # | Template | Done? |
|---|---|---|
| 1 | Arrival Checklist | ☐ |
| 2 | DueOut / Departure | ☐ |
| 3 | HK Review | ☐ |
| 4 | PA Review | ☐ |
| 5 | Manager Review | ☐ |
| 6 | Maintenance Report | ☐ |
| 7 | Pressure Washing | ☐ |
| 8 | Roof Preventive Maintenance | ☐ |
| 9 | Room Inspection | ☐ |

Fastest path: export/screenshot each form from Connecteam and walk it question-by-question — keep / kill / change.

**Also ask:** which questions does the team skip or answer ritually without looking? (Those are candidates to kill — every dead question costs field time daily.)

## 2. BLOCKER — Recurring schedule per template per property *(owner: PMs — needed Week 5, next week)*

For each template at each property: how often, which days, per-room or per-property, and who gets it (named person / any HK / unassigned pool)?
Example to prompt with: "Arrival — daily — occupied rooms only — assigned to whichever HK is on?"

## 3. BLOCKER — SLA defaults per issue priority *(owner: Christopher)*

Placeholders shipping now: URGENT 4h · HIGH 24h · MED 72h · LOW 168h. Confirm or correct. (Admin-editable later, so a gut-check answer is fine.)

## 4. BLOCKER — Spanish reviewer *(owner: Kate, but ask for volunteers)*

Field-staff screens ship bilingual EN+ES (machine-drafted). Who on the team is the bilingual reviewer before training (Phase 8)? Karla? Christopher? Someone on-property?

---

## 5. What's NEEDED vs NOT (current Connecteam workflow)

- Walk a real morning: from clock-in to first submitted checklist — every tap.
- What do you do in Connecteam today that you'd be unable to work without?
- What exists that nobody uses? (features, fields, steps)
- What do you currently work around — paper, texts, photos sent via WhatsApp/Teams instead of the app?
- Managers: what do you actually look at when reviewing? What do you ignore?
- Karla/Christopher: in the manual upload grind, what metadata do you type that the system should auto-fill?

## 6. Quality of Life

Prompt each role:
- **Speed:** what's the slowest part of filling a checklist today? Acceptable taps per room?
- **Photos:** how many per room is reasonable? Retakes annoying? Flash/low-light issues in rooms?
- **Language:** who prefers Spanish? (validates ES priority)
- **Connectivity:** where on property does the signal die? (informs offline expectations)
- **Mistakes:** what happens today when you submit wrong? (validates ADR-014 invalidation-request flow)
- **Notifications:** what do you want to be pinged about — and what would be noise?
- **Devices:** personal phones or shared devices? iOS/Android split? (informs install instructions + testing matrix)

## 7. Layout reactions (feeds Phase 7 redesign)

Show each screen, ask "what's confusing / missing / in the wrong place":
- [ ] Login → Today view (field staff)
- [ ] Checklist filling (all question types, photo, signature)
- [ ] Submit confirmation
- [ ] Review queue + single-submission review (managers)
- [ ] Issues list + detail
Capture verbatim quotes; per-screen, expected-vs-actual.

## 8. Parking lot

Anything raised that's out of v1 scope (time clock, scheduling, chat → Paycom/Teams). Write it down, say "noted, not v1," move on.

---

## Outputs owed after the meeting

1. Question sets per template → developer (unblocks seed content)
2. Recurring-rules matrix → developer (unblocks Phase 5, next week)
3. SLA confirmation → `/admin/sla`
4. Spanish reviewer name → Kate
5. NEEDED / NOT / QOL list → Phase 7 redesign input
6. Layout feedback per screen → Phase 7 redesign input
