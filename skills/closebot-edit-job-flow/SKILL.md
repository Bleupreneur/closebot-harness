---
name: closebot-edit-job-flow
description: Use when the user wants to surgically edit an existing CloseBot bot — phrases like "swap the calendar on bot X", "update instructions for X's qualification node", "toggle EnableEmail off on Y", "change the handover tag on Z", or any single-property mutation of a live bot. Executes the pull → mutate → push loop with diff preview and landed verification. Does NOT publish (use closebot-publish-safely separately).
tools: [cb bot version, cb bot pull, cb bot push]
---

# Skill: closebot-edit-job-flow

> Before changing anything, load the mental model: [`../../docs/HOW-CLOSEBOT-WORKS.md`](../../docs/HOW-CLOSEBOT-WORKS.md) (plugin install: `"$(cb root)/docs/HOW-CLOSEBOT-WORKS.md"`), especially §4, the safe change loop.

Surgical edits to an existing CloseBot bot. Pull the current draft, mutate one
property with `jq`, validate, diff, push — never touch anything else.

## When to use
- "change [property] on bot [id]" / "swap calendar for [bot]"
- "update the [section name] instructions on [bot]"
- "toggle EnableX on/off across all Method nodes on [bot]"
- "edit the handover tag on [bot]" / "rewrite the booking section for [bot]"

## Do not use when
- Adding a scenario node → `closebot-add-scenario`
- Uploading knowledge → `closebot-attach-knowledge`
- Building a flow from scratch → `closebot-build-job-flow`
- The bot was duplicated and needs re-pointing at a new client → `closebot-repurpose-bot`
- Bringing a bot up to the canonical framework → `closebot-apply-template`
- Publishing the result → `closebot-publish-safely` (Tier 2 gate, never call directly)

## Procedure
1. `cb bot version <id>` — resolves the edit target: highest semver, whether it's
   a draft, and the live version. Never hardcode a version — `/save` (which `cb
   bot push` wraps) has no version param: it overwrites the latest draft if
   unpublished, else forks a new one.
2. `cb bot pull <id> --out steps.json` — pulls that target version's job flow.
3. Show the user the current value of the field being changed (a short `jq`
   one-liner) and confirm the target node before mutating.
4. Apply the mutation with `jq`, writing back to `steps.json` — see
   `references/mutation-recipes.md` for the recipe per edit type (calendar
   swap, Instructions/Section/flag/tag edits, node rename, and both Job
   Information shapes — detect by NON-EMPTY length, never key-presence).
5. Run the 5 pre-save validations in `references/mutation-recipes.md` — unique
   node IDs, no dangling edges, every Booking/booking-enabled Method has a
   calendar, a Source node exists. Fix and re-check on any FAIL.
6. Diff before pushing: `diff <(jq -S . <original pull>) <(jq -S . steps.json)`.
   Show the user, confirm intent.
7. `cb bot push <id> steps.json` — saves, re-pulls the version it landed on,
   and verifies the content matches what was sent.
   - Exit 3 with a non-empty `invalidPaths` list → fix those paths in
     `steps.json`, re-run push.
   - Exit 3 with "re-pull failed" → the verification GET itself errored; retry
     before trusting anything.
   - Exit 3 with the **clobber** message → close the `app.closebot.com` editor
     tab for this bot, then push again — a UI autosave overwrote the API save.
8. Report `savedVersion`, `landed: true`, touched nodes, "draft only, not
   published." Hand off to `closebot-publish-safely` to ship it live.

## Tier
1 — mutates a reversible draft via `cb bot push`. Never publishes.

## Gotchas that shaped this skill
- Never hardcode a version — `cb bot version`/`cb bot pull` always resolve it.
- Calendar swaps must sweep with `walk()`, not just Section bodies — inline
  `.data.Instructions` references are the usual miss (GOTCHAS.md 2026-06-18).
- Job Information lives in `variables.business`, two shapes; detect by
  NON-EMPTY length or you silently write into the wrong empty shape.
- A UI autosave can add cosmetic nodes mid-edit — diff node lists if the
  version bumped between pull and push, and carry them forward.

## References
- `references/mutation-recipes.md` — jq recipe per edit type, the 5 pre-save
  validations, the UI-added-node check, and the common-pitfalls table.
- `references/api-build-pattern.md` — why raw React Flow structure must be
  preserved (never hand-build nodes); historical but still correct.
