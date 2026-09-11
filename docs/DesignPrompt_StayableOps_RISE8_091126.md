# Design Prompt — Stayable Operations: portal + PDF redesign

> Paste everything below the rule into Claude Design. One prompt, two
> deliverables (screens and paper), sharing one token system — which is the
> whole point: today they do not share one.
>
> Token values are copied from `rewards/client/src/tokens.css`, the live file —
> **not** from the canvas in `rewards/stayable-elevate-design-system/`, which is
> older and still contains a coral that was retired 2026-04-25.

---

## What I need

Redesign **Stayable Operations** (internal codename StayCheck) — a live
operational web app — and the **three PDFs it exports**, so both share an
aesthetic with our sister product **Stayable Elevate**, the employee rewards
platform. Elevate already went through a Claude Design pass; its token file is
the source of truth and is reproduced in full below.

Deliver, on one canvas:

- **A** — seven portal artboards (phone + desktop) plus a component system sheet
- **B** — four PDF artboards at true page proportion
- **C** — one `tokens.css` that both halves draw from, and a short note on every
  deliberate deviation from Elevate

Static HTML/CSS only. No JS, no framework, no React. I port this by hand into an
existing Next.js 15 + Tailwind v4 codebase and a `@react-pdf/renderer` pipeline,
so what I need is a *visual system with reference screens*, not an
implementation.

## Product context

Stayable Operations runs daily operations for **8 extended-stay hotels in
Florida** (Jacksonville ×2, Kissimmee ×2, Lakeland, Orlando, St. Augustine,
Davenport). It replaced Connecteam. Two very different audiences share it:

**Field staff — Housekeeping, Property Attendants, Maintenance Techs.** They use
it *one-handed, on a phone, walking a hotel corridor or standing in a parking lot
in Florida sun*. They open it to see which rooms they have today, fill a
checklist, take photos, submit. Many read Spanish first — field surfaces are
bilingual EN/ES. This surface has to survive glare, gloves and a cracked screen
protector.

**Managers and corporate.** Desktop, dense tables: a review queue, a dispatch
board, user administration, an issues pipeline, network monitoring. They are
triaging, so scanning speed beats beauty.

The PDFs are the paper output of the same data — a completed checklist sent to an
owner, and two operational reports. They get printed on office lasers and handed
to inspectors.

The app installs as a PWA. It has no public or marketing pages.

## The brand system — use these exact values, do not substitute

**Brand core**
```
--se-navy:          #0B1F3A   /* logo wordmark — primary, headers, primary CTA */
--se-navy-2:        #15335B
--se-sky:           #009CDE   /* logo roof — accents, focus rings, active states */
--se-sky-2:         #0080B8
--se-sky-soft:      #B8E3F4
--se-sunshine:      #FDDB24   /* logo dots — decorative accent ONLY */
--se-sunshine-deep: #E4BC0F
--se-sunshine-text: #8C6700   /* the readable yellow, for when yellow must be TEXT */
--se-sage:          #7FAA8A
--se-sage-deep:     #4E7A5C
```

**Surfaces — warm, never gray.** The single biggest change from the app's
current look, which is white on cool slate.
```
--se-cream: #FAF6EE   /* page ground */      --se-paper: #FFFDF8   /* cards */
--se-linen: #F2EADC   /* inset fill */       --se-oat:   #E7DDC9   /* borders */
--se-border-strong: #D4C6A6
```

**Ink scale — warm grays, not blue-grays**
```
--se-ink: #1A1A1A   --se-ink-2: #3D3A35   --se-ink-3: #6E6960
--se-ink-4: #9A968C   --se-ink-5: #C7C0B0
```

**Semantic** — `positive #4E7A5C` · `warning #CC8A1C` · `danger #C4473A`.
Coral was **retired 2026-04-25** and aliased to sky. Do not reintroduce it.

**Type — Poppins throughout** (Google Fonts).
```
12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64px
line-height: tight 1.05 · snug 1.25 · body 1.55 · loose 1.7
letter-spacing -0.035em at display sizes >= 28px
all-caps eyebrows: 11–12px, tracking 0.12em, weight 700
```
The app currently uses Nunito, chosen only because the real brand face (Adobe
*Urbane Rounded*) is domain-locked and cannot load on `ops.rentstayable.com`.
Poppins is free on Google Fonts, so the switch is both possible and the point.

**Shape**
```
--se-r-xs 4 · --se-r-sm 8 · --se-r-md 12 · --se-r-lg 18 · --se-r-xl 24 · --se-r-pill 999
--se-r-card: 14px 14px 18px 14px   /* deliberately asymmetric — hospitality feels handcrafted */
```

**Shadows** — paper-flat, never glassy. `sm 0 1px 2px rgba(26,26,26,.04)` ·
`md 0 2px 8px rgba(26,26,26,.06)` · `lg 0 8px 24px rgba(26,26,26,.08)` ·
`lift 0 12px 36px rgba(11,31,58,.12)`.

**Dark mode** exists in Elevate (`.se-dark`): cream→`#0F1418`, paper→`#1A2028`,
linen→`#222932`, oat→`#2E3540`, ink scale inverts. Design light first, but use
no colour that could not be inverted.

## ⚠ Where I want you to push back on Elevate

Elevate is a warm, low-contrast, cream-on-paper hospitality aesthetic built for a
feel-good rewards feed read at a desk. **Three of our contexts cannot afford it.**
I would rather you solve these than inherit them:

1. **Phone screens in daylight.** A housekeeper reading `--se-ink-3 #6E6960` on
   `--se-cream #FAF6EE` in direct Florida sun will not see it. On field-staff
   surfaces push body text to `--se-ink`/`--se-ink-2`, raise control contrast,
   keep tap targets >= 44px. Warmth is fine; low contrast is not.
2. **Dense manager tables.** Cream grounds with oat hairlines can turn a 30-row
   table into mush. Show how zebra, hover and column rhythm work at real density.
3. **Print.** The current PDFs use a cool neutral panel `#F4F5F7` that photocopies
   and faxes cleanly. Elevate's cream is a *tinted* ground and can band or muddy
   on a cheap laser. Show the warm version, but keep tints to panels and table
   headers rather than flooding the page — and say how it behaves in greyscale.

Put a short note on the canvas listing every deviation and why. A documented
deviation beats a pretty screen nobody can read at 11am in a parking lot.

---

# Part A — the portal

Seven artboards. Sizes are a guide.

### Phone (390 × 844)

1. **"Today" — field-staff home.** First screen a housekeeper sees: today's
   assigned checklists grouped by status, a **"Sent back"** section for flagged
   work needing a fix, and a done-count. Needs a greeting, the two-letter
   property code, checklist cards showing template + room + status, and an
   obvious "what next". Draw one card with **Spanish copy** so I can see how
   longer strings wrap.
2. **Checklist fill runtime.** The core loop — a vertical form of questions
   (yes/no, short text, number, single-select, **photo capture**) under section
   dividers. Needs: sticky progress, a question card with an optional **hint**
   line under the prompt, a photo question showing 2–3 thumbnails + an "add
   photo" tile **and a note field**, a required marker, a pinned submit bar, and
   one question in an incomplete/error state. Native camera only — no
   upload/browse affordance.
3. **Mobile navigation.** Bottom tab bar, at most 5 sections (Home, Checklist,
   Network, Maintenance, Construction), plus the sheet for a section with
   children. Must never scroll horizontally.

### Desktop (1440 × 900)

4. **Login.** Sets the tone. Email + password, forgot-password link, space for a
   wordmark. Elevate's login is two-panel editorial (navy left, cream right);
   something adjacent, but restrained — this is an operational tool.
5. **Review queue.** A manager's triage table: Status · Checklist · User · Date ·
   Unit # · Time-to-complete · Photo count · row actions (**Closed / Flag**).
   Above it, filter tabs: Pending (3) / Flagged (0) / Reviewed (0) / All. Show
   ~6 rows including one flagged and one with an incomplete photo count rendered
   `9/11` in a warning treatment. **This table currently overflows its
   container** — show the column rhythm that prevents that, and what a row
   action cluster looks like when it must stay on screen.
6. **Dashboard.** Corporate overview: stat tiles (completion %, overdue, flagged,
   unassigned), a per-property breakdown across the 8 short codes, a recent
   activity list. If you draw a chart, follow the `dataviz` conventions and
   justify it — I would rather have no chart than a decorative one.
7. **Admin → Users.** The densest surface, ~35 accounts: User (name + email +
   status chips) · Role (inline dropdown) · Location (On-site / Remote dropdown)
   · Properties · Last login · a **Manage** button expanding a panel under the
   row. Draw the expanded state: a switch with an explanatory sentence, three
   buttons, a password field, and 8 property toggle chips.

### Component system sheet

- **Buttons** — primary (navy fill), secondary (ghost, navy border), destructive,
  disabled, plus a compact variant for table rows.
- **Form fields** — label *above* (11–12px uppercase, tracked, 600), input,
  helper below, error state. Focus: navy border + 4px sky halo
  `0 0 0 4px rgba(0,156,222,0.18)`. Field itself flat — no shadow.
- **Select** — we render our own listbox (native selects render in Times on
  Windows Chrome). Show trigger *and* open popup with a selected tick.
- **Status chips** — 8 checklist states: Scheduled, To do, Started, Submitted,
  Reviewed, Flagged, Cancelled, Expired. Only Flagged and genuinely overdue may
  use danger, so that red keeps meaning.
- **Table** — header, row, hover, zebra, full-width expanded detail row.
- **Empty state** — we treat these as invitations to act, not shrugs.
- **Banner** — success, error, and one carrying a one-time password in monospace.
- **Property badge** — two-letter pill (JN, JW, KE, KW, LL, OR, SA, DP).

---

# Part B — the PDFs

## ⚠ Read this before drawing any page

These are **not browser pages**. `@react-pdf/renderer` supports a small CSS
subset. Anything outside it is not "hard to port" — it is impossible.

**Not available, do not use:** `box-shadow` (no shadows on anything) · gradients
· CSS Grid (**flexbox only**) · `position: sticky` · floats · `calc()` · runtime
CSS variables · pseudo-elements · CSS-loaded web fonts · transforms, filters,
blend modes.

**Available:** flexbox, padding/margin, `backgroundColor`, `color`,
`borderRadius`, 1px borders, absolute positioning, a `fixed` element that repeats
on every page (this is how header/footer work), images, SVG primitives, and
page-break control.

**Units are points.** US Letter, **612 × 792pt**, portrait, 24pt margin. A 10pt
body size is normal and correct at this scale.

**Fonts.** Only Helvetica/Times/Courier ship with the renderer; anything else is
registered from a `.ttf`, which I can do — so **assume Poppins**. But each weight
is a separate file bundled into a serverless function, so **use at most three
weights across all three documents**, and do not rely on italics.

### 1. Checklist submission — the important one

One completed checklist, exported by a manager. Portrait, **2–4 pages**. Draw
**page 1 and page 2** so the repeating furniture is visible.

- **Fixed header (≈48pt), every page** — "Stayable" wordmark with an accent
  detail, document title (`Arrival Checklist — LL — Rm 312 — May 26, 2026`), rule.
- **Fixed footer (≈28pt), every page** — left: system ID
  `CL-4645-ARR-20260526-012`; right: `Page 2 of 4`; generated timestamp in
  Eastern with an explicit `ET` suffix.
- **Meta panel**, page 1 only — a tinted block of 7–9 label/value pairs:
  Property · Room · Template · Assigned to · Scheduled · Submitted · Time to
  complete · Reviewed by · Outcome. Show how they wrap.
- **Body** — question blocks under navy **section headings** (the document's
  spine). Each block: **prompt** (most prominent); optional **hint** beneath it,
  e.g. `7:00pm / 10:00pm / End of shift` — often the only thing distinguishing
  three identical prompts, so it must not look like throwaway fine print;
  **answer** (show a Yes, a No, a long paragraph, and an unanswered one);
  **photos** — 2–4 captioned thumbnails plus **a note written by the person who
  took them** (currently amber ink, and new). A **flagged/failed** question must
  be findable when flicking through 4 pages — left rule, tint, margin marker,
  your call.
- **Reviewer verdict block** — the manager's Pass/Fail and note. On a fail or
  flag the note is mandatory, so it always has content when it matters.

### 2. Completeness report

Landscape or portrait — argue for one. Per-property table across the 8 short
codes: done / missed / flagged / reviewed over a date range, plus a total row.
The one document where a chart might earn its place; a clean table is an
acceptable answer.

### 3. Issues report

20–40 rows of open operational issues: property, room, priority (Low/Med/High/
Urgent), status, age, assignee, SLA target. A density problem — show header,
zebra, a priority treatment that survives greyscale, and how an overdue SLA
reads without relying on red alone.

### Shared PDF furniture

Same header bar, wordmark placement and footer grammar across all three. Same
table header treatment and hairline weight. Same label/value styling. Same `ET`
time format. Page numbering on every document, including single-page ones.

---

## Hard constraints — the "without breaking it" part

The app is live and in use. These are not preferences.

- **Deliver tokens, not a rewrite.** The most useful artefact is a `tokens.css`
  I can map 1:1 onto Tailwind v4 `@theme` entries and onto the `palette` object
  in `lib/pdf/pdf-styles.ts`. Every colour, radius, shadow and size in every
  artboard must come from a named token defined at the top of that file.
- **Keep the information architecture.** Same sections, routes, columns, fields.
  If something belongs elsewhere, note it on the canvas — do not silently move it.
- **Do not rename mechanics.** Status names, role names (HK, PA, MT, MANAGER,
  AGENT, NETWORK_TECH, CORPORATE, ADMIN), the two-letter property codes and the
  "Closed / Flag" review verbs are wired to a database.
- **Every timestamp shows Eastern with an `ET` suffix** — "Submitted 5:23 AM ET".
  All 8 properties are in Florida; the suffix is deliberate.
- **Greyscale-safe on paper.** Status must be distinguishable without colour —
  weight, glyph, border or label, never hue alone.
- **No gradients, no glassmorphism.** Elevate is paper-flat.
- **No icon-only destructive buttons.** A bare trash can is how the wrong thing
  gets deleted.
- **Accessibility is a requirement.** Body text at AA against its real
  background; colour never carries meaning alone; visible focus rings.
- **Do not invent fields.** The data listed is what exists. If something looks
  missing, note it rather than drawing a field I cannot fill.

## What to skip

- No marketing or landing pages, no pricing, no onboarding carousel.
- No avatars or profile photos — we do not store them.
- No notification bell or inbox UI — notifications go by email and Teams.
- No chat, comments or @-mentions. Out of scope by decision, not oversight.
- No settings page. It does not exist and should not start here.
- No charts on phone screens.
- PDFs: no cover page, no table of contents, no appendix, no QR codes, no
  watermark, no logo lockup variations.

## Output

- One canvas: 7 portal artboards + component sheet + 4 PDF artboards.
- One `tokens.css` structured like Elevate's — `:root` of `--se-*` properties,
  then a dark-mode block, commented where a value is not self-evident.
- A short note covering: every deliberate deviation from Elevate and why
  (especially the three contrast decisions above), which three Poppins weights
  you used, how the warm palette prints in greyscale, and anywhere you had to
  work around the PDF renderer's CSS subset.

Suggested canvas name: `stayable-operations-redesign`.
