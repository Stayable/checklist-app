# Design Prompt — Stayable Operations portal (StayCheck)

> Paste everything below the rule into Claude Design. It carries the real token
> values (copied from `rewards/client/src/tokens.css`, not from memory), the
> screens to draw, and the constraints that keep the result portable into a live
> Next.js app.
>
> **Companion prompt:** `DesignPrompt_PDF_RISE8_091126.md` covers the PDF export.
> Run this one first — the PDF should follow the portal's decisions, not race them.

---

## What I need

Redesign **Stayable Operations** (internal codename StayCheck), a live operational
web app, so it shares an aesthetic with our sister product **Stayable Elevate**
(the employee rewards platform). Elevate already went through a Claude Design
pass and its token file is the source of truth — reproduced in full below.

**Deliver a design canvas with the artboards listed under "Screens to draw",
plus one `tokens.css` file.** Static HTML/CSS only — no JS, no framework, no
React. I port it by hand into an existing Next.js 15 + Tailwind v4 + shadcn
codebase, so what I need from you is a *visual system and a set of reference
screens*, not an implementation.

## Product context

Stayable Operations runs daily operations for **8 extended-stay hotels in
Florida** (Jacksonville ×2, Kissimmee ×2, Lakeland, Orlando, St. Augustine,
Davenport). It replaced Connecteam. Two very different audiences share it:

**Field staff — Housekeeping, Property Attendants, Maintenance Techs.**
They use it *one-handed, on a phone, walking a hotel corridor or standing in a
parking lot in Florida sun*. They open it to see what rooms they have today,
fill a checklist, take photos, and submit. Many read Spanish first — field
surfaces are bilingual EN/ES. This is the surface that has to survive glare,
gloves, and a cracked screen protector.

**Managers and corporate.** Desktop. Dense tables: a review queue, a checklist
dispatch board, user administration, network monitoring, an issues pipeline.
They are triaging, so scanning speed beats beauty.

The app is installed as a PWA to the home screen. It is not a marketing site and
has no public pages.

## The brand system to match — use these exact values

From `rewards/client/src/tokens.css`. Do not substitute or "improve" the hexes.

**Brand core**
```
--se-navy:          #0B1F3A   /* logo wordmark — primary, headers, primary CTA */
--se-navy-2:        #15335B
--se-sky:           #009CDE   /* logo roof — accents, focus rings, active states */
--se-sky-2:         #0080B8
--se-sky-soft:      #B8E3F4
--se-sunshine:      #FDDB24   /* logo dots — decorative accent ONLY */
--se-sunshine-deep: #E4BC0F
--se-sunshine-text: #8C6700   /* the readable yellow — use when yellow must be TEXT */
--se-sage:          #7FAA8A
--se-sage-deep:     #4E7A5C
```

**Surfaces — warm, never gray.** This is the single biggest difference from the
app's current look, which is white-on-cool-slate.
```
--se-cream:  #FAF6EE   /* page background */
--se-paper:  #FFFDF8   /* card background */
--se-linen:  #F2EADC   /* inset / secondary fill */
--se-oat:    #E7DDC9   /* borders */
--se-border-strong: #D4C6A6
```

**Ink scale — warm grays, not blue-grays**
```
--se-ink:   #1A1A1A    --se-ink-2: #3D3A35    --se-ink-3: #6E6960
--se-ink-4: #9A968C    --se-ink-5: #C7C0B0
```

**Semantic**
```
--se-positive: #4E7A5C   --se-warning: #CC8A1C   --se-danger: #C4473A
```
Coral was **retired 2026-04-25** and aliased to sky. Do not reintroduce it.

**Type — Poppins throughout** (400/500/600/700/800), Google Fonts.
```
12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64px
line-height: tight 1.05 · snug 1.25 · body 1.55 · loose 1.7
letter-spacing -0.035em on display sizes >= 28px
all-caps eyebrows: 11-12px, tracking 0.12em, weight 700
```
The app currently uses Nunito, chosen only because the real brand face (Adobe
*Urbane Rounded*) is domain-locked and cannot load on `ops.rentstayable.com`.
Poppins is on Google Fonts and free, so switching to it is both possible and the
point of this exercise. Assume Poppins.

**Shape**
```
--se-r-xs 4  --se-r-sm 8  --se-r-md 12  --se-r-lg 18  --se-r-xl 24  --se-r-pill 999
--se-r-card: 14px 14px 18px 14px   /* deliberately asymmetric — hospitality feels handcrafted */
```

**Shadows** — paper-flat, never glassy.
```
--se-shadow-sm:    0 1px 2px rgba(26,26,26,0.04)
--se-shadow-md:    0 2px 8px rgba(26,26,26,0.06), 0 1px 2px rgba(26,26,26,0.04)
--se-shadow-lg:    0 8px 24px rgba(26,26,26,0.08), 0 2px 6px rgba(26,26,26,0.04)
--se-shadow-lift:  0 12px 36px rgba(11,31,58,0.12), 0 2px 8px rgba(11,31,58,0.06)
```

**Dark mode** exists in Elevate (`.se-dark`): cream→`#0F1418`, paper→`#1A2028`,
linen→`#222932`, oat→`#2E3540`, and the ink scale inverts. Design light first,
but do not use any colour that would be impossible to invert.

## ⚠ The one place you should push back on Elevate

Elevate is a warm, low-contrast, cream-on-paper hospitality aesthetic built for
a *feel-good rewards feed* read on a desk. **Two of our surfaces cannot afford
it**, and I would rather you solve this than inherit it:

1. **Phone surfaces in daylight.** A housekeeper reading `--se-ink-3 #6E6960`
   body text on `--se-cream #FAF6EE` in direct Florida sun will not see it.
   For field-staff screens, push body text to `--se-ink`/`--se-ink-2`, raise
   control contrast, and keep tap targets >= 44px. Warmth is fine; low contrast
   is not.
2. **Dense manager tables.** Cream backgrounds with oat hairlines can turn a
   30-row table into mush. Show me how zebra striping, row hover and column
   rhythm work in this palette at real density.

State explicitly, in a short note on the canvas, where you deviated from Elevate
and why. I would rather have a documented deviation than a pretty screen nobody
can read at 11am in a parking lot.

## Screens to draw

Seven artboards. Sizes are a guide, not a constraint.

### Phone (390 × 844)

1. **"Today" — field staff home.** The first screen a housekeeper sees. Shows
   today's assigned checklists grouped by status, a "Sent back" section for
   flagged work needing a fix, and a done-count. Needs: a greeting, the property
   short code (JN/JW/KE/KW/LL/OR/SA/DP — two letters, canonical everywhere), a
   list of checklist cards each showing template name + room number + status,
   and an obvious "what do I do next". Bilingual — show one card with Spanish
   copy so I can see how longer strings wrap.

2. **Checklist fill runtime.** The core loop. A vertical form of questions —
   yes/no, short text, number, single-select, and **photo capture** — grouped
   under section dividers. Needs: a sticky progress indicator, a question card
   with an optional hint line under the prompt, a photo question showing 2–3
   captured thumbnails plus an "add photo" tile *and a note field*, a required
   marker, and a pinned submit bar. Native camera only, so no upload/browse
   affordance. Show one question in an error/incomplete state.

3. **Mobile navigation.** A bottom tab bar of at most 5 sections (Home,
   Checklist, Network, Maintenance, Construction) plus the sheet that opens when
   a section has children. It must never scroll horizontally.

### Desktop (1440 × 900)

4. **Login.** Sets the tone for everything else. Email + password, a forgot-
   password link, and space for a Stayable wordmark. Elevate's login is a
   two-panel editorial layout (navy left, cream right) — something adjacent to
   that would be right, but this is an operational tool, so restrained.

5. **Review queue.** A manager's triage table. Columns: Status · Checklist ·
   User · Date · Unit # · Time-to-complete · Photo count · row actions
   (Closed / Flag). Above it, filter tabs: Pending (3) / Flagged (0) / Reviewed
   (0) / All. Show ~6 rows including one flagged and one with an incomplete
   photo count (rendered `9/11` in a warning treatment). **This table currently
   overflows its container** — show me the column rhythm that stops that
   happening, and what a row action cluster looks like when it must stay on
   screen.

6. **Dashboard.** Portfolio overview for corporate: a row of stat tiles
   (completion %, overdue, flagged, unassigned), a per-property breakdown of the
   8 properties by short code, and a recent-activity list. Follow the `dataviz`
   conventions if you draw any chart — but tiles and a table may well be enough,
   and I would rather have no chart than a decorative one.

7. **Admin → Users.** The densest admin surface. A table of ~35 accounts:
   User (name + email + status chips) · Role (a dropdown, inline-editable) ·
   Location (dropdown: On-site / Remote) · Properties · Last login · a "Manage"
   button that expands a panel under the row. Draw the expanded state: it holds
   a switch with an explanatory sentence, three buttons, a password field, and a
   row of 8 property toggle chips. This screen is where the design will be
   stress-tested, so give it real attention.

## Component specs I need alongside the screens

Draw these once, clearly, as a small system sheet:

- **Buttons** — primary (navy fill), secondary (ghost, navy border), destructive
  (danger), and disabled. Plus a small/compact variant for table rows.
- **Form fields** — label *above* (11–12px, uppercase, tracked, weight 600),
  input, helper text below, error state. Focus: navy border + 4px sky halo
  `0 0 0 4px rgba(0,156,222,0.18)`. Flat — no shadow on the field itself.
- **Select** — we render our own listbox (native selects render in Times on
  Windows Chrome), so show trigger *and* open popup with a selected tick.
- **Status chips** — we have 8 checklist states: Scheduled, To do, Started,
  Submitted, Reviewed, Flagged, Cancelled, Expired. Only Flagged and genuinely
  overdue may use danger; everything else stays quiet so red means something.
- **Table** — header, row, hover, zebra, and a full-width expanded detail row.
- **Empty state** — we treat these as invitations to act, not shrugs.
- **Banner** — success, error, and one carrying a one-time password in monospace.
- **Property short-code badge** — a two-letter pill (JN, JW, KE, KW, LL, OR, SA, DP).

## Hard constraints — the "without breaking it" part

The app is live and in use. These are not preferences.

- **Deliver tokens, not a rewrite.** The single most useful artefact is a
  `tokens.css` I can map 1:1 onto Tailwind v4 `@theme` entries. Every colour,
  radius, shadow and type size in your screens must come from a named token
  defined at the top of that file.
- **Keep the information architecture.** Same sections, same routes, same
  columns, same fields. If you think something belongs elsewhere, note it on
  the canvas as a suggestion — do not silently move it.
- **Do not redesign the mechanics.** Status names, role names (HK, PA, MT,
  MANAGER, AGENT, NETWORK_TECH, CORPORATE, ADMIN), the two-letter property
  codes, and the "Closed / Flag" review verbs are all wired to a database and
  cannot be renamed as part of a visual pass.
- **Every timestamp displays Eastern with an `ET` suffix** — e.g. "Submitted
  5:23 AM ET". All 8 properties are in Florida and that suffix is deliberate.
- **No gradients on cards, no glassmorphism.** Elevate is paper-flat.
- **No icon-only buttons for destructive actions.** A trash can with no label is
  how the wrong thing gets deleted.
- **Accessibility is a requirement, not a polish pass.** Body text at AA against
  its actual background. Colour never carries meaning alone — a status chip
  always has its word. Focus rings visible on every interactive element.

## What to skip

- No marketing pages, no landing page, no pricing, no onboarding carousel.
- No avatars or profile photos — we do not store them.
- No notification bell / inbox UI — notifications go out by email and Teams.
- No chat, comments, or @-mentions. Out of scope by decision, not oversight.
- No charts on the phone screens.
- Do not design a settings page. It does not exist and should not start here.

## Output

- One design canvas with the seven artboards plus the component system sheet.
- One `tokens.css`, structured like Elevate's: `:root` block of `--se-*` custom
  properties, then a dark-mode block, with comments explaining any token whose
  value is not obvious.
- A short written note listing **every deliberate deviation from Elevate** and
  the reason — especially the contrast decisions for phone surfaces.

Suggested canvas name: `stayable-operations-redesign`.
