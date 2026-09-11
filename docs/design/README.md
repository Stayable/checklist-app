# Design source of truth

**`stayable-ops-redesign/`** — the Claude Design output for the 2026-09-11
portal + PDF redesign, produced from `DesignPrompt_StayableOps_RISE8_091126.md`.

| File | What it is |
|---|---|
| `tokens.css` | **The one to read.** Elevate-derived tokens, with three `[OPS]` deviation sets the designer added and justified: a field-surface contrast set, a table-density set, and a print set. |
| `Stayable Operations Redesign.dc.html` | The canvas — 7 portal artboards, a component sheet, a dark sheet, 4 PDF artboards and a greyscale check. |
| `_ds/` | ⚠ **A DIFFERENT SYSTEM. Do not apply.** See below. |

## ⚠ Two conflicting systems arrived in one folder

`_ds/stayable-new-design-system-*/` is a **Stayable marketing brand system**,
built from the rentstayable.com website and the logo artwork. It is not what was
asked for and it does not match Elevate:

| | `_ds/` (marketing) | `tokens.css` (Elevate) — **applied** |
|---|---|---|
| Navy | `#0a1020` | `#0B1F3A` |
| Accent | cyan `#00e5ff` | sky `#009CDE` |
| Type | Montserrat + Source Sans 3 | Poppins |
| Neutrals | cool `#f1f4f8` | warm cream `#FAF6EE` |

Claude Design attaches a design system to a canvas; this one was built from
public brand material rather than from the Elevate token file the prompt
supplied. **The root `tokens.css` is the one that answers the brief** — Kyle's
instruction was "same aesthetic as rewards", and Elevate *is* rewards.

Leaving `_ds/` in place because it is a legitimate artefact of the brand's
marketing surface and may be the right answer for a future public-facing page.
It is simply not the answer for this app.

## What has been applied so far

Only the **token layer**, in `app/globals.css` and `app/layout.tsx`:

- Brand tokens → Elevate values (navy, sky, sunshine)
- Tailwind's built-in `slate-*` ramp and `white` remapped onto Elevate's warm
  ink/surface scale — this is what re-skins every screen without editing
  components, since the codebase hard-codes those utilities ~1,200 times
- `emerald` / `amber` / `red` warmed to Elevate's semantic values, meanings
  unchanged
- shadcn base tokens (`--background`, `--card`, `--border`, …) warmed to match
- Nunito → **Poppins**

## What is deliberately NOT applied

**The layouts, and the PDF. Kyle's call, 2026-09-11: "Just the looks is ok. No
need the completion etc."** This is a decision, not a backlog item — do not
re-propose it as unfinished work.

So the artboards' structural changes stay on the canvas: the review queue's
column rhythm, the checklist fill runtime, the admin expand panel, the mobile
tab bar. Each is a per-screen port that touches real markup, and the point of
stopping at tokens is that nothing in the app's behaviour had to move.

`lib/pdf/pdf-styles.ts` still carries the cool ops-kit palette (navy `#0F1E33`,
panel `#F4F5F7`, Helvetica). **The PDF therefore no longer matches the app** —
the screens are warm Elevate, the exports are cool ops-kit. That divergence is
accepted for now and is worth knowing before anyone reports it as a bug.

The canvas remains the reference if any of this is ever wanted.
