---
name: resume
description: Use at the start of a session on the RISE8 Operations Platform to get oriented. Reads TODO.md, the Current Status block in CLAUDE.md, and recent git log; prints what's open, what just shipped, and the next concrete step. Keep output under 25 lines.
---

# /resume — RISE8 Ops Platform session warmup

Goal: get the developer oriented in under 5 seconds. No exploration, no code reading, no speculation.

## Steps

1. Read `TODO.md` — extract:
   - The first section header that contains any `[ ]` or `[~]` items (this is the active phase)
   - All `[~]` (in progress) rows, regardless of phase
   - The first 3 `[ ]` rows in the active phase, in order
   - Any `[!]` (blocked) rows across the file, with the blocker note
2. Read the `## Current Status` section of `CLAUDE.md` — extract `As of`, `Phase`, `Current week`, `Last milestone`, `Next milestone`, and the count of open questions.
3. Run `git log --oneline -10` to see recent commits.
4. Print a single compact block in this exact shape:

```
RISE8 Ops Platform — resume
Status: <Phase> · <Current week> · as of <date>
Last shipped: <Last milestone>
Next milestone: <Next milestone>

In progress ([~]):
  - <row> (<phase>)

Up next ([ ]) in <active phase>:
  1. <row>
  2. <row>
  3. <row>

Blocked ([!]):
  - <row> — <blocker>

Recent commits:
  <hash> <subject>
  <hash> <subject>
  <hash> <subject>

Open questions in CLAUDE.md: <count>
```

5. If any section is empty, omit it entirely — do not print "(none)" placeholders.
6. Do NOT read PRD.md, ARCHITECTURE.md, or SPRINT_PLAN.md unless the user asks a follow-up that requires them. They are large and burn context.
7. Do NOT propose work or start a task. Just report. Wait for the user's next instruction.

## Hard rules

- Output is read-only. Never write to TODO.md or CLAUDE.md from this skill — that's `/checkpoint`'s job.
- Cap output at 25 lines. If TODO.md has many in-progress rows, show the top 5 and note `…+N more` on a final line.
- If `TODO.md` or `CLAUDE.md` is missing, say so on one line and stop. Do not attempt to recreate them.
