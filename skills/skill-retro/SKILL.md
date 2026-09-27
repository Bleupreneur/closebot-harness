---
name: skill-retro
description: The self-healing review for skills. Fires automatically (via the Stop hook) at the end of any turn where one or more skills ran — or invoke manually. A background agent judges whether a faster/more-appropriate skill should have been used, whether the used skill or its backing script needs updating for speed/correctness, AUTO-APPLIES improvements to the skill/script files, and logs every gotcha via `cb gotcha add`. Use after finishing skill-driven work, or when a skill felt slow, clunky, or wrong.
tools: [cb gotcha add, cb gotcha review]
---

# Skill: skill-retro (self-healing loop)

Skills should get faster every time they're used. This skill closes that
loop: after skills run, review them, fix them, and record the gotchas — so
the next run is quicker. It runs as a **background agent** so it never
blocks the user's turn, and it has authority to edit skill/script files
directly — that auto-apply authority is the whole point.

## When to use
- **Automatically:** `.claude/hooks/skill-mark.sh` records each skill used
  this turn; `.claude/hooks/skill-retro-check.sh` blocks the `Stop` once and
  tells the main agent to spawn one background review agent.
- **Manually:** invoke any time a skill felt slow, clunky, or wrong.

## Do not use when
- The work is mutating a live CloseBot bot — this is a meta-review of
  skill/script files, not bot work, and must never call a mutating CloseBot
  endpoint itself.

## Procedure
1. **Right skill?** Was this the fastest, most-appropriate skill for what
   was asked? If a different existing skill would have been faster/safer,
   say so — and if the mis-selection came from a vague/overlapping trigger,
   tighten that skill's `description:` wording so it wins next time.
2. **Skill needs updating?** Did the operator improvise around it — extra
   manual calls, re-reading the same thing, a step the skill omitted, a
   stale fact, a wrong path/endpoint? Fold the fix into the `SKILL.md` or
   its backing `scripts/*.sh`, preferring to move repeated inline logic into
   the script. On a long multi-commit turn (e.g. an SDD plan's human-gate
   closeout), scan **every** commit made since the last `Stop`
   (`git log --oneline <marker-commit>..HEAD`), not just the most recent
   action — a real gotcha can surface mid-turn (a snapshot step that missed
   files, a workaround the operator found and moved past) and is just as
   loggable as the final one.
3. **Apply the fix directly.** Edit the `SKILL.md` / script. Keep the
   repo's skill voice (frontmatter, When to use, Procedure, Tier, Gotchas).
   Never weaken a Tier 2 safety gate to go faster — speed never overrides
   the publish/confirmation discipline.
4. **Log every gotcha** with `cb gotcha add --skill <name> --symptom "…"
   --cause "…" --fix "…"` (never edit GOTCHAS.md by hand — it writes a
   newest-first row for you). GOTCHAS.md lives at the repo root;
   `skills/GOTCHAS.md` is a symlink kept for old links. Log even when no
   code change was needed — gotchas are this loop's durable memory.
5. Run `cb gotcha review` and promote any unreviewed, real API surprises
   with `--mark` so they join the human-reviewed table.
6. **Report** a 3-6 line summary: skills reviewed, what changed, gotchas
   logged, and anything too risky to auto-apply (surface those for human
   approval instead of forcing them).

## Guardrails

| Do | Don't |
|----|-------|
| Edit skill docs + `scripts/*.sh` to remove friction | Touch live bots / call any mutating CloseBot endpoint |
| Tighten triggers to fix mis-selection | Broaden a trigger so much it now overlaps another skill — check the pack for collisions first |
| Move repeated inline steps into the backing script | Weaken a Tier 2 gate, confirmation step, or validation for speed |
| Always log via `cb gotcha add` | Edit `settings.json`, CLAUDE.md tiers, or permissions because "it'd be faster" |
| Leave edits uncommitted for the user to review unless the repo's CLAUDE.md says otherwise; if you do commit, stage your own edited files by explicit path | `git add -A`, `git push`, or commit files you didn't edit — if a second background agent runs concurrently, give it disjoint files and stay off them |

## Tier
Tier 0 against CloseBot itself (reads only, never touches a bot) but it
**writes to the repo's own skill/script files** — that's its whole job.

## Gotchas that shaped this skill
- Loop-safety: the `Stop` hook clears its marker and honors
  `stop_hook_active` so this fires at most once per turn even across
  repeated stops.
- A skill mis-selection is a trigger-wording problem, not a routing-table
  problem — fix the `description:`, don't add a special case elsewhere.
- A retro that only looks at the action tied to the triggering `Skill` call
  can miss a gotcha that happened earlier in the same multi-commit turn
  (2026-09-05: a human-gate closeout found 6 of 41 duplicated skill
  copies had diverged from their originals — a gap in an earlier
  snapshot step — and the retro that ran right after logged two other
  gotchas but not that one). Always diff the full commit range for
  the turn before deciding gotcha-logging is complete.
- A guardrail here can drift from the repo's current commit convention —
  don't assume it is still current without checking CLAUDE.md for a
  later-adopted convention that supersedes it.

## References
- `.claude/hooks/skill-mark.sh` — records skills used this turn (PostToolUse:Skill)
- `.claude/hooks/skill-retro-check.sh` — fires the loop at Stop (loop-safe)
