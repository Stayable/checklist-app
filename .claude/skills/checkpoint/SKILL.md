---
name: checkpoint
description: Use before /clear, before ending a session, or whenever a meaningful chunk of RISE8 Ops Platform work just landed. Updates TODO.md (check off completed rows, add new ones, move items between phases) and refreshes the Current Status block in CLAUDE.md so the next session can resume cleanly. Project-local — overrides the global checkpoint skill for this repo.
---

# /checkpoint — RISE8 Ops Platform session checkpoint

Goal: persist what happened this session into `TODO.md` and `CLAUDE.md` so the next session (or the next developer) is not lost. Targeted edits only — no rewrites.

## Inputs to gather

Before editing anything, collect:

1. What was completed this session — from the conversation, NOT by re-running code. Map each item to an existing TODO.md row if one exists.
2. What's still in progress — what the user is mid-stream on.
3. What's newly discovered — bugs, scope items, follow-ups that aren't in TODO.md yet.
4. What's now blocked and why.
5. Today's date in `YYYY-MM-DD`. Use the `currentDate` from the system context if present; otherwise ask once.

If any of 1–4 is ambiguous, ask ONE focused question. Never a list.

## Edits to make

### TODO.md (targeted Edit calls only — never Write the whole file)

- For each completed item: change `[ ]` or `[~]` to `[x]`. Leave the row in place.
- For each in-progress item: change `[ ]` to `[~]`. If it was already `[~]`, leave it.
- For each newly blocked item: change to `[!]` and append `— blocked: <reason>` to the Notes column.
- For each newly discovered item: add a new row to the most appropriate phase table. Use the existing column layout (`| Pri | Status | Task | Owner | Notes |`). Choose Pri honestly — default to P2 if unsure; flag P0 only for true blockers.
- Do not reorder rows. Do not collapse completed rows into a "Completed" section — TODO.md uses inline status.

### CLAUDE.md `## Current Status` section

Update these fields in place:

- `**As of:**` → today's date in `Month D, YYYY` format (match the existing style)
- `**Phase:**` → only if it changed
- `**Current week:**` → only if it changed
- `**Last milestone:**` → set to the most significant thing completed this session, if it qualifies as a milestone (auth shipped, a sprint week closed, a doc finalized). Do NOT downgrade an existing milestone for a smaller win.
- `**Next milestone:**` → only if it changed

For the `### Open questions awaiting answer` list:
- If a question was resolved this session, remove it and add a one-liner to `### Recently resolved decisions` with the date.
- If a new open question surfaced, append it with Owner and Needed-by.

## Hard rules

- Use `Edit` for every change to TODO.md and CLAUDE.md. Never `Write` (overwrite) these files — they contain a lot of context that's easy to lose.
- Do not invent completions. If you're not certain something landed, ask before checking it off. The PRD and Sprint Plan are authoritative for what "done" means.
- Do not touch `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/SPRINT_PLAN.md`, or `docs/DECISIONS.md` from this skill. If a checkpoint warrants an ADR, surface that to the user as a suggestion — do not write the ADR yourself.
- Do not stage or commit. Leave that to the user.
- After edits, print a short summary (under 10 lines):
  - `TODO.md: <N> completed, <N> in progress, <N> added, <N> blocked`
  - `CLAUDE.md: As of → <date>; Last milestone → <…>` (only lines that actually changed)
  - `Suggested next: <one sentence>` (optional — only if there's an obvious next step)

## When not to checkpoint

- The session only read code or answered questions — nothing changed and nothing new surfaced. Say so and exit.
- The user is mid-edit on TODO.md or CLAUDE.md themselves. Ask first to avoid stepping on their changes.
