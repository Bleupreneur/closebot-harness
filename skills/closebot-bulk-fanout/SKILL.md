---
name: closebot-bulk-fanout
description: Use when the user wants to apply an operation across many CloseBot bots/sources/leads at once — phrases like "update X across all bots", "for every client do Y", "find every bot using calendar Z", "tag all leads with [tag]", "republish every draft", "audit all sources". Provides safe fan-out patterns with per-call confirmation for Tier 2 operations. REFUSES to chain Tier 2 (DELETE, publish, billing) calls without per-bot user approval.
tools: [cb bot list, cb bot version, cb bot pull, cb bot push, cb bot audit]
---

# Skill: closebot-bulk-fanout

Safe patterns for operating across many CloseBot bots at once. The loop body
is always pull → `jq` mutation → push; publish never happens inside a loop.

## When to use
- "update X across all bots / clients" / "for every client do Y"
- "find every bot using calendar Z" / "migrate everyone off the old X"

## Do not use when
- Only READING/comparing many bots, not changing them →
  `$CLOSEBOT_DIR/.claude/workflows/closebot-view-agents.md` (`scripts/cb-view-agents-fleet.sh`)
- The operation is Tier 2 (publish, delete) — this skill lists candidates and
  stops; each one goes through `closebot-publish-safely` individually

## Procedure
1. Build the target list: `cb bot list --json | jq -r '.[].id'` (filter by
   name/pattern first if the sweep is narrower than the whole fleet).
2. **Dry run first, always.** For each bot: `cb bot pull <id> --out
   pulled-<id>.json`, apply the `jq` mutation into a second file, then `diff`
   the two. Print a table of `{bot, wouldChange}` — this is the semantic
   preview (which fields on which node), which `cb bot push --dry-run`
   doesn't show (it only confirms the request shape and node count, fixed
   2026-09-05 — see Gotchas). Optionally sanity-check with `cb bot push <id>
   mutated-<id>.json --dry-run` right before step 4 to confirm nothing sends
   until you mean it to.
3. Show the user the candidate list and a sample diff. Require an explicit
   "PROCEED" before step 4 — never auto-loop a write.
4. Execute, one bot at a time: pull the CURRENT draft again (don't reuse a
   stale pull from step 2 — another edit may have landed since), apply the
   same `jq` mutation, `cb bot push <id> mutated-<id>.json`. Never call
   `cb bot publish` inside this loop.
5. On the first `landed:false` (`cb bot push` exits 3), **stop the loop.**
   Print what happened and leave the remaining bots untouched — each prior
   save is already atomic and won't be rolled back, but nothing further runs
   unattended.
6. Report a table: `{bot, savedVersion, landed}` for everything that ran.
   Tell the user drafts are updated, NOT published — publish each one
   individually via `closebot-publish-safely`.

## Tier
Mixed — `cb bot list` / `cb bot pull` / `cb bot audit` are Tier 0, `cb bot
push` is Tier 1 (per bot, reversible). Tier 2 fan-out (publish, delete) is
refused outright: list candidates, hand each one to its own Tier-2-gated
skill, one user turn at a time.

## Gotchas that shaped this skill
- `cb bot push --dry-run` used to exit 3 with a misleading "UI autosave
  clobbered" message even though nothing was sent — the composite had no
  dry-run branch, so its request descriptor broke the `savedVersion`/
  `landed` re-pull check. **FIXED 2026-09-05 in `cli/lib/bot.mjs`**: it now
  prints `{dryRun:true, method, url, nodes}` and exits 0 without re-pulling
  (GOTCHAS.md 2026-09-05). It still only confirms the request shape, not
  the semantic diff — keep using the pull/`jq`/diff preview in step 2 for
  that, and treat `push --dry-run` as an optional final sanity check.
- Never hardcode a version per bot — each bot in the fleet has its own
  draft/live state; `cb bot pull` / `cb bot version` resolve it per-bot.
- A failed save mid-loop leaves that bot's PRE-mutation state intact (each
  save is atomic) — safe to stop-on-first-failure and resume just the
  failed ones later.
- The sandbox bot in `cli/sandbox.json` is the only id safe to loop a
  live write test against; never pick a bot by name to "test with" — a
  test/template-named bot can be a real client's live clone
  (GOTCHAS.md 2026-09-04).

## References
- `references/fanout-patterns.md` — read-only inventory sweeps (per-source
  KB counts, calendar/flag finders, the framework-parity fleet sweep), the
  calendar-migration and FAQ-broadcast worked examples, the Tier 2
  list-and-stop pattern for publish/delete candidates, and the per-lead
  AI-toggle batch pattern.
