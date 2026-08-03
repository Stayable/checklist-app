# Construction Coordination Agent — Briefing & Decision Questionnaire

**Prepared for:** Rob
**Prepared by:** Kyle (via Claude Code)
**Date:** June 20, 2026
**Matter:** AI agent to help manage the construction team, in conjunction with the RISE8 Operations Platform (the in-development "Connecteam replacement" — `checklist-app`)
**Status:** Concept for review — no build started

---

## 0. How to use this document (Rob)

1. Read **Sections 1–4** — the analysis and the recommended approach.
2. Answer the questions in **Section 5**. You can do this two ways:
   - Reply to Kyle directly with your answers, **or**
   - Drop this file into a Claude conversation and answer the questions in chat; Claude will walk you through them.
3. When the questions are answered, **instruct Claude to generate the handoff file** described in **Section 6**. That file is what you forward back to Kyle so the build can continue.

> One-line prompt you can paste into Claude after answering:
> *"Using my answers above and Section 6 of this brief, generate the handoff markdown file `ConstructionAgentDecisions_RISE8_<MMDDYY>.md` for me to forward to Kyle."*

---

## 1. Executive summary

**The ask:** "Can we have an agent help manage the construction team? It's been quite difficult."

**The finding:** The difficulty is structural, and it's fixable. The Operations Platform we're building (`checklist-app`) is designed for **disciplined, structured input** — in-house staff with accounts, following recurring checklists. **Construction contractors break every one of those assumptions** — they're external, transient, and communicate the messy way (texts, photos, voice notes). The platform expects clean data; contractors emit noise. That gap is the pain.

**The recommendation (3 points):**
1. **Build the agent *inside* the Operations Platform** as new modules — not as a separate app, and not by merging the old prototype repo in. One product, one codebase, one deploy.
2. **The agent's job is translation:** absorb unstructured contractor communication and turn it into the structured tasks, issues, and sign-offs the platform already understands — always with a human approving before anything consequential happens.
3. **Start narrow:** one inbound channel → AI extraction → human review queue. Prove the bridge, then expand.

**Cost/effort:** Net-new feature. Reuses ~70% of what the platform already has (geofence, roles, issues/SLA, audit, Teams digest). Adds modest AI API cost per message.

---

## 2. Background: the two systems

There were three things in play; here's how they relate.

| System | What it is | Owned? | Verdict |
|---|---|---|---|
| **Connecteam (SaaS)** | The third-party app we use today | No (vendor) | Being retired. Not a place to build. |
| **RISE8 Operations Platform** (`checklist-app`) | Next.js app we're building to replace Connecteam | **Yes** | **The home for the agent.** |
| **FieldOps AI** (`ai-codex-starter`) | An earlier Python prototype: WhatsApp → AI → field events | Yes | **Reference blueprint only.** Wrong tech stack to reuse directly. |

**Confirmed:** "the Connecteam app" = the **in-development Operations Platform**, not the existing subscription.

---

## 3. The real difficulty (why this is hard today)

The Operations Platform works beautifully for housekeeping, property attendants, and maintenance techs because they are **employees on a routine**: they have logins, they follow recurring checklists, they tap through structured forms, they take geofenced photos.

**Construction crews are the opposite:**
- External and transient — they won't create accounts or learn our checklist forms.
- They report progress conversationally: *"done with 204, water heater's leaking, need parts, back tomorrow."*
- The information is real and valuable, but it arrives as **unstructured noise** the platform can't file.

The platform's own roadmap already anticipated this — **Contractor Checklists (magic-link, no account) and Quick Tasks are deferred to Phase 9/10 (ADR-012)** and aren't built yet. That is the empty slot the agent fills.

**What's reusable vs. what's new:**
- **Already built in the platform (TypeScript):** geofence verification, role-based access, the Issue + SLA pipeline, audit logging, and the daily Teams digest. The agent does **not** rebuild these.
- **The one genuinely new capability:** turn unstructured field communication into structured work, via AI, with human review. (This is the single idea worth taking from the old FieldOps AI prototype — its *design*, not its code.)

**On merging the repos (technical decision):** We will **not** merge the old prototype into the platform, nor nest it as a "project inside a project." They are different languages and runtimes (Python vs. TypeScript); combining them creates build conflicts, duplicate configs, and maintenance drag for zero benefit. The platform stays the single project; the agent is built natively inside it; the prototype is kept as read-only reference and then archived.

---

## 4. How the agent works inside the platform

**Core design:** a thin **channel adapter** normalizes any inbound source into one common shape, then a single AI pipeline turns it into structured work.

```
WhatsApp ─┐
Email ────┤→ [channel adapter] → InboundMessage → [background job]
SMS ──────┤                                            │
magic-link┘                                            ▼
                              resolve: which contractor? property? work item?
                                                       │
                                                       ▼
                            AI structured extraction (Claude)
                          { event type, summary, suggested task/issue,
                            confidence, human-review status, source IDs }
                                                       │
                                                       ▼
                        write to DB → HUMAN REVIEW QUEUE → a person approves
                                                       │
                          ┌────────────────────────────┼─────────────┐
                          ▼                            ▼              ▼
                   Issue + SLA               Quick Task / contractor   Teams digest
                  (existing pipeline)          sign-off (Phase 9/10)   (existing)
```

**Three possible shapes** (we recommend building them in this order):

| Option | What it does | Pro | Con |
|---|---|---|---|
| **A. Ingestion / triage agent** *(recommended first)* | Contractor message/photo → AI extracts → proposes a task/issue → human approves → flows into existing pipelines | Attacks the core pain; reuses everything already built; nothing happens without approval | Needs a defined inbound channel |
| **B. Manager copilot** | In-app chat: *"which units are behind on the renovation?"* AI reads the data and answers / drafts assignments | Visible, demo-friendly; helps managers directly | Only as good as the data already captured — doesn't fix input |
| **C. Autonomous coordinator** | Agent proactively nudges contractors and chases overdue work | Cuts manager chasing | Outbound automation to vendors = risk; later phase only |

**Guardrails (non-negotiable):** every AI output carries a confidence score and a human-review status; nothing consequential (task creation, assignment, sign-off) happens without a person approving it; everything is audit-logged with the source message stored. **No decisions are made by AI alone.**

**Recommended phasing:**
1. **Phase 1 — Intake bridge:** one channel live → AI extraction → human review queue. The MVP that proves contractors' reality can enter the system.
2. **Phase 2 — Manager copilot:** chat over the captured data.
3. **Phase 3 — Outbound nudges:** behind a feature flag, once trust is established.

---

## 5. Decision questionnaire (Rob to answer)

### A. Scope & definition
- **A1.** Is the "construction team" the **renovation/buildout contractors** working across the Stayable properties, a **dedicated in-house construction crew**, or **both**?
- **A2.** What is the **single biggest pain** right now? (e.g., no visibility into progress · constantly chasing contractors for updates · work slipping/late · quality & punch-list tracking · documentation for draws/billing)
- **A3.** Roughly how many active contractors/crews and how many concurrent projects/properties?

### B. Communication channel
- **B1.** How do contractors report status **today**? (WhatsApp · SMS/text · email · phone calls · in person · nothing systematic)
- **B2.** Would contractors be willing to message a **company WhatsApp Business number** if asked? Any expected resistance?
- **B3.** Do they typically share **photos** and/or **voice notes**?

### C. What "manage" should produce
- **C1.** Rank what matters most for the agent to produce: structured task list & status · progress %/milestones · blocker & delay alerts · photo-verified completion sign-offs · daily summary to managers · billing/draw documentation.
- **C2.** Who needs to **see** the output? (Rob · property managers · asset management · accounting)

### D. Sequencing & ownership
- **D1.** Build this **now** (alongside the platform v1) or as the planned **Phase 9/10** work after the Connecteam cutover?
- **D2.** Is this **urgent** (active projects are suffering today) or **strategic** (important, not on fire)?
- **D3.** Who **reviews and approves** the agent's proposed tasks/issues day-to-day? (which role)

### E. Constraints & guardrails
- **E1.** Do we need any **contractor consent/agreement** before logging their messages? (legal/jurisdiction)
- **E2.** Confirm comfort with **human-in-the-loop review** before any task is created or assigned. (Recommended: yes.)
- **E3.** Is a **modest AI cost per message** acceptable within the platform's ~$40–50/month operating target?

---

## 6. Instructions: generate the handoff file for Kyle

Once the Section 5 questions are answered, produce a new markdown file named:

```
ConstructionAgentDecisions_RISE8_<MMDDYY>.md
```

It should contain, tightly:

1. **Decisions** — Rob's answer to each question A1–E3 (one line each; "undecided" is a valid answer).
2. **Confirmed scope** — one paragraph: what the agent is, who it's for, the #1 pain it solves.
3. **Chosen launch channel** (from B) and **sequencing** (from D1).
4. **Open items / risks** — anything Rob flagged as uncertain or needing legal/budget sign-off.
5. **Green-light status** — one of: *Proceed to implementation plan* · *Proceed to a smaller proof-of-concept* · *Hold, needs more discussion*.

Kyle will take that file and continue the build in `checklist-app`.

---

*Appendix — repository note:* The agent is built inside `checklist-app` (the Operations Platform). The older `ai-codex-starter` (FieldOps AI) repo is reference only and will be archived. The two are **not** merged.
