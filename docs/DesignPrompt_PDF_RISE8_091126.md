# Design Prompt — Stayable Operations PDF exports

> Paste everything below the rule into Claude Design.
>
> **Run `DesignPrompt_Portal_RISE8_091126.md` first.** These PDFs are the paper
> form of that portal and should inherit its decisions — particularly the
> Poppins switch and the warm surface palette — rather than arriving at their own.

---

## What I need

Redesign the three PDF exports produced by **Stayable Operations**, our internal
operations app for 8 extended-stay hotels in Florida, so they read as the same
product as our sister app **Stayable Elevate** and as the portal redesign that
precedes this prompt.

**Deliver static HTML/CSS mockups at exact page proportions** — one artboard per
page, including a *second page* of the multi-page document so I can see the
repeating furniture. No JS. I port these by hand into `@react-pdf/renderer`.

## ⚠ Read this section before drawing anything

These are **not browser pages**. They are rendered by `@react-pdf/renderer`,
which supports a deliberately small subset of CSS. Anything outside it is not
"hard to port" — it is impossible, and I will have to throw the design away.

**Not available. Do not use:**
- `box-shadow` — no shadows of any kind, on anything
- gradients of any kind (`linear-gradient`, `radial-gradient`)
- CSS Grid — **flexbox only**, and only `row`/`column`, `wrap`, `justify*`,
  `align*`, `flex`
- `position: sticky`, floats, `calc()`, CSS variables at render time
- pseudo-elements (`::before`, `::after`)
- web fonts loaded by CSS — see Fonts below
- `overflow: hidden` as a layout tool, transforms, filters, blend modes

**Available and used freely:**
- flexbox, padding/margin, `backgroundColor`, `color`, `borderRadius`,
  1px borders (`borderBottomWidth` etc.), absolute positioning
- a `fixed` element that repeats on every page — this is how the header and
  footer work
- images, and vector shapes via an SVG primitive
- page break control: an element can be told not to split across a page

**Units are points (pt), not pixels.** Page is US Letter, **612 × 792 pt**,
portrait. Current margin is 24pt. Design at that scale — a 10pt body size is
normal and correct here, not small.

**Fonts.** The renderer ships only Helvetica, Times and Courier. Any other face
must be registered from a `.ttf` file, which I can do — Poppins is on Google
Fonts, so **assume Poppins is available** (400/500/600/700). But specify weights
explicitly and sparingly: each one is a separate font file bundled into the
serverless function, so **use at most three weights across all three documents**.
Note: Poppins has no true italic in the variable set I would bundle — do not
rely on italics to carry meaning.

## Brand tokens

Same Elevate system as the portal. The full list is in the portal prompt; the
values that matter on paper:

```
navy        #0B1F3A   title bar, table headers, section headings
sky         #009CDE   accent rules, links, active markers
sunshine    #FDDB24   brand accent only — never as text, never alone
ink         #1A1A1A   body text
ink-3       #6E6960   captions, footer, secondary meta
cream       #FAF6EE   page ground / panel fill
paper       #FFFDF8   card fill
oat         #E7DDC9   hairlines
positive    #4E7A5C   pass / complete
warning     #CC8A1C   attention
danger      #C4473A   fail / flagged
```

**One caution specific to print.** The current PDFs use a cool neutral panel
(`#F4F5F7`) and they photocopy and fax cleanly. Elevate's warm cream `#FAF6EE`
is a *tinted* ground: on a cheap office laser it can band or come out muddy, and
these documents genuinely do get printed and handed to inspectors. Show me the
warm version, but keep tinted areas to panels and table headers rather than
flooding the whole page — and say on the canvas how you expect it to print in
greyscale.

## The three documents

### 1. Checklist submission — the important one

One completed checklist, exported by a manager from the review screen or sent to
an owner. Portrait, **multi-page — typically 2–4 pages**. Draw **page 1 and
page 2** so the repeating furniture is visible.

Filename convention on disk: `Arrival_4645_052626_Rm312.pdf`.

**Fixed header, repeats on every page** (currently 48pt tall):
- "Stayable" wordmark with an accent detail
- Document title — e.g. `Arrival Checklist — LL — Rm 312 — May 26, 2026`
- A rule under it

**Fixed footer, repeats on every page** (currently 28pt):
- Left: system ID, e.g. `CL-4645-ARR-20260526-012`
- Right: `Page 2 of 4`
- Generated timestamp, Eastern, with an explicit `ET` suffix

**Meta panel**, page 1 only — a tinted block of label/value pairs:
Property · Room · Template · Assigned to · Scheduled · Submitted · Time to
complete · Reviewed by · Outcome. Seven to nine pairs. Show how they wrap.

**Body** — a sequence of question blocks, grouped under **section headings**
(the headings are navy and act as the document's spine):
- **Prompt** — the question, the most prominent thing in the block
- **Hint** — an optional smaller line under the prompt, e.g. the checkpoint time
  `7:00pm / 10:00pm / End of shift`. Often the only thing distinguishing three
  otherwise identical prompts, so it must not look like throwaway fine print
- **Answer** — Yes/No, free text, a number, or a selected option. Show a Yes, a
  No, a longer paragraph answer, and an unanswered one
- **Photos** — a row of 2–4 thumbnails with captions, plus **a note written by
  the person who took them**. Show the note treatment clearly; it is new and
  currently rendered in amber ink
- A **flagged / failed** question needs to be findable when flicking through a
  4-page document. Solve that — a left rule, a tint, a margin marker, your call

**Reviewer verdict block** — the manager's Pass/Fail and their note. On a failed
or flagged submission the note is mandatory, so it will always have content when
it matters.

### 2. Completeness report

Landscape or portrait, your call — argue for one. A per-property table across
the 8 properties (short codes JN, JW, KE, KW, LL, OR, SA, DP) showing checklists
done / missed / flagged / reviewed over a date range, with a total row. This is
the one document where a chart might earn its place; if you draw one, follow the
`dataviz` conventions and justify it. A clean table is an acceptable answer.

### 3. Issues report

A list of open operational issues: property, room, priority (Low/Med/High/
Urgent), status, age, assignee, SLA target. Roughly 20–40 rows, so this is a
density problem: show header, zebra, a priority treatment that survives
greyscale, and how an overdue SLA reads without relying on red alone.

## Shared furniture I want consistent across all three

- The same header bar, wordmark placement and footer grammar
- The same table header treatment and hairline weight
- The same label/value pair styling in meta panels
- The same Eastern-time format with the `ET` suffix everywhere
- Page numbering on every document, including single-page ones

## Hard constraints

- **US Letter portrait, 612 × 792pt**, unless you argue for landscape on the
  completeness report specifically.
- **Greyscale-safe.** These get printed on office lasers and faxed. Every status
  must be distinguishable without colour — that means weight, a glyph, a border,
  or a label, never hue alone.
- **The header and footer repeat.** Body content must never collide with them —
  page padding has to clear both.
- **A question block should not split across a page break** where avoidable.
  Design blocks that are short enough for that to be achievable.
- **No decorative imagery.** These are records; an inspector or an owner reads
  them. Restraint reads as competence here.
- **Do not invent fields.** The data listed above is what exists. If something
  looks missing, note it on the canvas rather than drawing a field I cannot fill.

## What to skip

- No cover page. Nobody wants a second sheet of paper.
- No table of contents, no appendix, no signature block beyond the reviewer
  verdict that already exists.
- No QR codes or barcodes — nothing scans them.
- No watermark, no "CONFIDENTIAL" stamp.
- No logo lockup variations — one wordmark treatment, used consistently.

## Output

- Artboards at true page proportion: checklist p1, checklist p2, completeness,
  issues — four minimum.
- A token block at the top of the CSS naming every colour and size used, so I
  can map it onto the `palette` and `styles` objects in `lib/pdf/pdf-styles.ts`.
- A short note on: which weights of Poppins you used (max three), how the warm
  palette behaves in greyscale, and any place you had to work around the
  renderer's CSS subset.

Suggested canvas name: `stayable-operations-pdf-redesign`.
