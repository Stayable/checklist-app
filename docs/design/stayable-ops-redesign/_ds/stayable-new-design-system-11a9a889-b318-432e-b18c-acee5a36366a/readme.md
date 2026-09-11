# Stayable Design System

The brand system for **Stayable** — the extended-stay hotel and furnished-suite brand operated by **RISE8 Companies** (Boca Raton, FL; CEO Rob Beyer). Stayable runs 1,300+ furnished apartment-style units across eight Florida communities and sells flexible nightly, weekly and monthly stays with no credit check and no long-term commitment.

Positioning, in the brand's own words: **"Flexible. Affordable. Home."** — *Clean, spacious suites. Affordable prices. Flexible options.* Not luxury, not budget-motel: practical, comfortable, honest.

---

## Sources used to build this system

| Source | What it gave us |
|---|---|
| `uploads/New Stayable.jpg` | The **new Stayable logo lockup** (white wordmark + sky chevron + three dots on a navy panel). Every colour and every logo asset in `assets/` is mechanically extracted from this file. |
| `https://rentstayable.com` (fetched Aug 2026) | Information architecture, nav order, the eight locations, live marketing copy, FAQ text, footer structure, tone of voice. Used verbatim for the website UI kit's content. |
| `rise8-business-context` skill | Company background, portfolio, brand voice/tone principles, audience segments, operational facts (office hours, fees, amenities). |

**Not available, and therefore not recreated:** no codebase, no Figma file, no font binaries, no photography library, and no component inventory were supplied. The image and CSS assets on rentstayable.com could not be fetched from this environment (hot-linking and direct asset fetches both fail). See **Caveats** at the bottom.

---

## Products represented

1. **rentstayable.com — the marketing website.** The brand's primary surface: hero + booking bar, eight location pages, offers, FAQ, careers, contact. Recreated in `ui_kits/website/`.
2. **Direct booking flow.** The live site hands off to Cloudbeds for reservations and to `apply.rentstayable.com` for leases — neither is a Stayable-designed surface. `ui_kits/booking/` is a **first-party** booking funnel expressed entirely in Stayable's own language, so the system has a transactional surface to work from.

---

## CONTENT FUNDAMENTALS

**The voice is a helpful neighbour, not a front desk.** Warm, plain, practical, never salesy.

- **You, not we.** Copy is written second-person and benefit-first: *"Easy booking, no long-term commitment, no credit check, and one bill for all the essentials lets you come and go on your time."* "We" appears only where the company is answering for itself (*"We offer discounted weekly and monthly rates…"*, *"We require a refundable damage fee…"*).
- **Sentence case for prose, Title Case for headings, ALL CAPS for navigation and buttons.** Nav items and CTAs are uppercase in the rendered UI (`HOME`, `LOCATIONS`, `BOOK NOW`) but written Title Case in markup and let CSS do the casing.
- **Headlines are short, verbal and often use "Stay" as a pivot:** *Stay awhile…*, *Stay Flexible.*, *Stay Fresh.*, *Stay longer. Save more.* Period-terminated headline fragments are a brand habit — keep them.
- **Location headings are place-proud and two or three words:** *Relax in Jax*, *Orlando Awaits*, *Experience Kissimmee*, *Enjoy Vibrant Lakeland*, *Enjoy the Scene*, *Discover Davenport*.
- **Triads.** The brand thinks in threes: *Flexible. Affordable. Home.* / *Clean, spacious suites. Affordable prices. Flexible options.* Use a triad for a hero or a section opener; don't stretch it to four.
- **Eyebrow + headline pairs** carry the section rhythm, and the eyebrow completes into the headline: `ENJOY ALL OF THE` → **Comforts of Home**; `MAKE A SPLASH` → **Large Swimming Pools**; `YOU HAVE THE FREEDOM TO` → **Stay awhile…**
- **Money and rules are stated plainly, up front, never buried.** *"Taxes are not included."* *"Refunds are issued upon departure if no damage is found."* *"Your stay must be fully paid in advance for the time you choose."* The brand explains *why* a fee exists rather than hiding it: *"This allows us to offer a lower, more affordable base rate, letting our guests add on what they need instead of paying for what they don't want."*
- **Asterisk footnotes** are the house device for conditional amenities: `Housekeeping*` → *"\*Housekeeping and linen exchange services are available for a minimal fee."*
- **Inclusive by default.** Families, workers on assignment, people between homes, and pets — *"because we know pets are part of the family."* Never imply a guest is in a bad situation.
- **No emoji. No exclamation-mark stacking. No jargon** ("synergy", "seamless", "elevate", "curated"). No pressure language beyond honest scarcity (*"Only 2 left"*).
- **CTA vocabulary is fixed and short:** *Book Now*, *View Location*, *Search*, *Continue*, *Get in Touch*, *Search Job Openings*, *Sign a Lease*.

---

## VISUAL FOUNDATIONS

### Colour
Three colours carry the brand: **navy `#0A1020`** (ink and the dominant inverse surface), **cyan `#00E5FF`** — rgb(0,229,255), the confirmed brand accent, used for the chevron and the dots, and **white**. Navy and sky each get a 7–10 step scale (`tokens/colors.css`); a warm sand (`#F7F5F1`) exists purely to break up long white marketing pages. Semantic colours are muted and desaturated so they never compete with sky.

The ratio is roughly **70% white / 20% navy / 10% sky**. Sky is never a large fill except on the accent CTA and small chips — it is a highlight, not a background. **Never** put sky text on white below 18px (contrast); use `--sky-700` for accent text on light.

### Typography
Two families. **Montserrat** (display) sets everything structural — headlines, eyebrows, buttons, labels, nav — because it is the closest available match to the wordmark's geometric grotesque. **Source Sans 3** sets all running text. Display type is tight (`-0.02em`, 1.12 line-height) and heavy (700); body is generous (1.6–1.75). Eyebrows are 12px uppercase at `0.16em`. Nothing sits between 34 and 42px — the jump from heading to display is deliberate.

### Spacing & layout
A 4px base scale to 128px. Sections breathe at `96px` vertical (`--section-y`), tighten to `56px` on dense pages. `--container-max` is 1200px with 48px gutters; long-form prose caps at 760px / 68ch. The header is **sticky navy**; the location page adds a second sticky tab bar directly beneath it. Nothing else is fixed — no floating chat bubbles, no sticky footers.

### Backgrounds
Full-bleed **photography** with a scrim is the hero treatment; everything else is flat colour. There are **no gradients as decoration**, no hand-drawn illustration, no repeating pattern or texture, no noise. The only gradients in the system are functional scrims (`--scrim-image` bottom-up, `--scrim-hero` left-to-right, `--scrim-flat` for modals). Sections alternate white → sand → navy → white for rhythm; **never more than two background colours in one viewport**.

### Photography
Bright, natural daylight; warm-neutral white balance; real, occupied rooms rather than staged luxury sets. Families, workers and pets, candid not posed. The practical stuff is shown proudly: pools, playgrounds, laundry rooms, kitchenettes. No B&W, no duotone, no heavy grain, no teal-orange grading, no vignettes. Cards crop 16:10, heroes 21:9, portrait splits 4:5, all with a 16px radius.

### Corners, borders, cards
`4 / 6 / 10 / 16 / 24 / pill`. **Cards are 16px** with a 1px `--border-subtle` hairline and `--shadow-sm`; photos inside cards go edge-to-edge (radius clipped by the card). **Controls are pill-shaped** — buttons and chips are fully rounded; inputs are the exception at 6px, which is what keeps a form from looking like a row of buttons. Buttons carry a **2px** border (so outline and filled variants share a footprint); everything else uses 1px.

### Shadows
Soft, navy-tinted, never black: `xs` 1px, `sm` 2/6, `md` 8/20, `lg` 18/44, `overlay` 28/70. Cards rest at `sm` and rise to `lg` on hover. No inner shadows anywhere except the optional `--shadow-inset-top` hairline on navy surfaces. No coloured glows.

### Interaction states
- **Hover** — buttons shift to a *lighter* navy (`--navy-600`) or a deeper sky; they never change opacity. Cards lift `-3px` and deepen their shadow. Nav links turn sky and grow a 2px sky underline.
- **Press** — `scale(.985)` plus the darkest navy. No colour flash, no ripple.
- **Focus** — a 1px navy border plus a 3px `rgba(87,187,221,.45)` sky ring. Always visible; never removed.
- **Disabled** — `--navy-100` fill with `--navy-300` text, no border change, `not-allowed` cursor. Never just opacity.
- **Selected** — navy fill with white text (chips, tabs) or a 2px navy border (cards). Sky is reserved for *live/on* states like the Switch.

### Motion
Short and soft. `140ms` for controls, `220ms` for cards and panels, `600ms` for scroll reveals. Easing is `cubic-bezier(.32,.72,.32,1)` (standard) and `cubic-bezier(.16,1,.3,1)` (entrances). **No bounce, no spring, no parallax, no auto-playing carousels that move on their own.** Transitions are fades and 3–8px translations; nothing slides across the screen. Respect `prefers-reduced-motion` by dropping transforms and keeping opacity.

### Transparency & blur
Used in exactly one place: the booking bar floating over a hero photo (`rgba(255,255,255,.10)` + `blur(10px)` + a 1px white-18% border). Everywhere else surfaces are opaque. Scrims over photos are solid-colour gradients, not blur.

---

## ICONOGRAPHY

**Substitution flagged:** Stayable has no icon set of its own in any supplied source, and the site's icons could not be fetched. This system standardises on **[Lucide](https://lucide.dev) v0.462.0**, served from `unpkg.com/lucide-static`, as the closest match to the site's thin-line amenity icons (2px stroke, rounded caps, 24px grid, outline-only — no filled glyphs).

- Use the **`Icon`** component for every icon. It renders the Lucide SVG as a CSS mask so glyphs inherit `currentColor` — icons are navy, sky or white, never multi-colour.
- **Sizes:** 13–15px inline with text, 17–18px in controls, 20–22px in amenity circles, 26px+ only in empty states.
- **Amenity vocabulary (fixed):** `wifi`, `waves` (pool), `washing-machine`, `dog` (pet friendly), `refrigerator`, `tv`, `utensils` (kitchenette), `sparkles` (housekeeping), `dumbbell`, `baby` (cribs), `flame` (BBQ), `car-front` (parking), `key-round` (flexible move-in), `map-pin`, `calendar-days`, `users`, `ruler`.
- **Never** use emoji, Unicode dingbats, or hand-drawn SVG as an icon. The only non-Lucide glyph permitted is the **`✓`** inside the booking stepper and the **`▾`** on the Locations nav item, both of which are typographic, not iconographic.
- **The chevron mark is not an icon.** `assets/stayable-mark-chevron.png` is a logo asset — use it for favicons, avatars and tight lockups only; never inline it in a sentence or an amenity row.

### Logo assets (`assets/`)
> **Wordmark is raster-only, by design.** The lockup letterforms are Mulish ExtraBold, which is *not* one of this system's webfonts (Montserrat + Source Sans 3). A font-dependent SVG `<text>` lockup would render differently on every machine, so the full lockup ships as PNG recoloured from the supplied artwork. Only the chevron mark and favicons are vector (pure paths, self-contained). **Send the vector logo (AI/EPS/SVG with outlined text) if you need an infinitely scalable lockup.**
| File | Use |
|---|---|
| `stayable-logo-dark.png` | Navy wordmark + sky chevron, transparent — for white, sand and sky surfaces |
| `stayable-logo-light.png` | White wordmark + sky chevron, transparent — for navy surfaces |
| `stayable-logo-navy-bg.png` | The supplied lockup on its navy panel, as delivered |
| `stayable-mark-chevron.png` | Chevron only, transparent |
| `stayable-logo-dark-export.png` | **Dark version** — navy `#0A1020` wordmark + `#00E5FF` chevron, transparent; recoloured from the supplied lockup, so the letterforms are the real ones |
| `stayable-logo-bright-export.png` | **Bright version** — white wordmark + `#00E5FF` chevron, transparent; for navy/photo surfaces |
| `stayable-mark.svg` `stayable-mark-brand.png` | Chevron + dots only, brand blue |
| `stayable-favicon.svg` `stayable-favicon-512.png` | Favicon / app tile — chevron + three dots in cyan on navy, 112px corner radius on a 512 box |
| `stayable-favicon-light.svg` `stayable-favicon-512-light.png` | Same mark on white, for light-mode tabs |
| `stayable-favicon-light.svg` | Favicon on white, for light-mode tabs |
| `stayable-favicon-512.png` | Raster favicon |

All four are mechanically extracted from `uploads/New Stayable.jpg` (background keyed out; the dark variant is the same artwork with the white wordmark recoloured to `--navy-800`). **Nothing was redrawn.** Clearspace is one chevron-height on all sides; never re-typeset the wordmark, recolour the chevron, or separate the three dots.

---

## Index

**Root**
- `styles.css` — the single entry point consumers link (`@import` list only)
- `readme.md` — this file · `SKILL.md` — Agent Skills wrapper · `thumbnail.html` — homepage tile

**`tokens/`** — `fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `radius.css` · `elevation.css` · `motion.css`

**`assets/`** — the logo files listed above (4 supplied PNGs + dark/bright SVG lockups, favicons, raster exports)

**`guidelines/`** — 22 specimen cards: Colors (brand core, navy scale, sky scale, status, surfaces, text, scrims) · Type (families, display, headings, body, eyebrow) · Spacing (scale, layout rhythm, control heights) · Brand (radii, elevation, motion, logo lockups, chevron mark, iconography, photography)

**`components/`** — 23 primitives, each with `.jsx`, `.d.ts`, `.prompt.md`, plus one card per group
- `core/` — `Button`, `IconButton`, `Icon`, `Badge`, `Tag`, `Card`, `Logo`
- `forms/` — `Field`, `Input`, `Select`, `Checkbox`, `Radio`, `Switch`, `DateField`
- `navigation/` — `Tabs`, `Accordion`
- `feedback/` — `Dialog`, `Toast`, `Tooltip`
- `marketing/` — `SectionHeading`, `PropertyCard`, `AmenityTile`, `BookingBar`

**`ui_kits/`**
- `website/` — rentstayable.com recreation: home, location detail, offers, contact (see its `README.md`)
- `booking/` — four-step direct booking flow (see its `README.md`)

### Intentional additions
No source defined a component inventory, so the standard primitive set was authored. Four brand-specific additions earn their place because the site cannot be assembled without them: **`PropertyCard`** (the location card repeated eight times on the homepage), **`BookingBar`** (the hero search), **`AmenityTile`** (the amenity rows on every page), and **`SectionHeading`** (the eyebrow-plus-headline pattern that opens every section). **`Icon`** wraps the substituted Lucide set. **`Logo`** exists so no one re-typesets the wordmark.

---

## Caveats — help us make this exact

1. **Fonts are substituted.** Montserrat + Source Sans 3 are best-guess matches to the wordmark. **Please send the licensed Stayable typefaces (or name them)** and we'll swap in real `@font-face` rules.
2. **Icons are substituted.** Lucide stands in for whatever the site actually uses. If there's a real icon set, send it.
3. **No photography.** Every image in both UI kits is a labelled placeholder. Send a folder of approved photos (or grant asset access to rentstayable.com) and the kits become presentation-ready.
4. **Colour beyond the logo is inferred.** Navy and sky are exact; the scales, sand neutral, and semantic colours were built around them. If there's an existing brand palette document, it overrides this.
5. **No codebase or Figma.** Component structure follows the rendered site's patterns, not its source. If the site's theme, a Figma library, or a repo exists, attach it and the primitives can be made pixel-exact.
