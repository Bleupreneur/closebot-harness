---
name: closebot-add-scenario
description: Use when the user wants to add a scenario interrupt to a CloseBot job flow — phrases like "add aggression handling to [bot]", "make the bot detect goodbyes", "add a custom scenario for [trigger]", "if the lead says X, do Y as a scenario", "set up bot-detection". Adds ScenarioAggression, ScenarioBotDetection, ScenarioGoodbye, or ScenarioCustom nodes safely with proper wiring at the graph level. These nodes fire from anywhere in the conversation, overriding the main flow.
tools: [cb bot pull, cb bot push, cb bot test]
---

# Skill: closebot-add-scenario

> Before changing anything, load the mental model: [`../../docs/HOW-CLOSEBOT-WORKS.md`](../../docs/HOW-CLOSEBOT-WORKS.md) (plugin install: `"$(cb root)/docs/HOW-CLOSEBOT-WORKS.md"`), especially §4, the safe change loop.

Add scenario interrupts (Aggression / Bot Detection / Goodbye / Custom) to an
existing CloseBot flow. Scenarios fire from *anywhere* in the conversation —
they're top-level overrides, not part of the main path.

## When to use
- "add aggression detection to [bot]" / "make the bot recognize goodbyes"
- "if X happens, switch to Y" (described as an interrupt, not main flow)
- "add bot-detection so we don't waste credits on spam bots"
- "set up a custom scenario for [trigger]"

## The four scenario types

| Type (`type`) | Display | Fires when |
|---|---|---|
| `ScenarioAggression` | Aggression Detected | Lead is hostile, threatening, or abusive |
| `ScenarioBotDetection` | Bot Detected | Lead appears to be another AI / spam bot |
| `ScenarioGoodbye` | Goodbye Detected | Lead clearly signals they're done |
| `ScenarioCustom` | Custom Scenario | User-defined plain-English trigger condition |

## Do not use when
- The property to change already exists on a node → `closebot-edit-job-flow`
- Designing a whole flow from scratch → `closebot-build-job-flow`
- Publishing the result → `closebot-publish-safely`

## Procedure
1. `cb bot pull <id> --out steps.json` — pull the current draft (resolves the
   edit target itself; never hardcode a version).
2. Check for an existing scenario of the requested type:
   `jq '.nodes[] | select(.type | startswith("Scenario"))' steps.json`. If one
   already exists, ask: edit it, or skip? CloseBot only honors one `Scenario*`
   of each type.
3. Generate node IDs and build the scenario node + its response chain — the
   full `jq` builder for each of the four types (Aggression, Bot Detection,
   Goodbye, Custom) is in `references/scenario-node-builders.md`, along with
   the standard response-chain pairing per type.
4. Validate before saving:
   ```bash
   test 0 -eq $(jq '.nodes | group_by(.id) | map(select(length > 1)) | length' steps.json) || echo "FAIL: duplicate IDs"
   test 0 -eq $(jq '.nodes as $n | .edges | map(select((.source as $s | ($n|map(.id)|index($s))==null) or (.target as $t | ($n|map(.id)|index($t))==null))) | length' steps.json) || echo "FAIL: dangling edges"
   ```
5. `cb bot push <id> steps.json` — same exit-3 semantics as
   `closebot-edit-job-flow`: non-empty `invalidPaths` → fix and retry; the
   clobber message → close the `app.closebot.com` editor tab and push again.
6. `cb bot test <id> "<trigger message>" --max-time 30` — sandbox-verify the
   scenario fires; trigger examples per type are in
   `references/scenario-node-builders.md`. Confirm the reply matches the
   chain you built.
7. Report and hand off:
   ```
   ✓ Added {scenario_type} to bot {id}
     Scenario node: {SCENARIO_ID}
     Chain: {scenario → ... → End}
     Sandbox test: {pass/fail + 1-line evidence}
   NEXT — invoke closebot-publish-safely to ship it live.
   ```

## Tier
1 — mutates a reversible draft (`cb bot push`); `cb bot test` self-cleans its
ephemeral lead. Never publishes.

## Gotchas that shaped this skill
- Every scenario chain must terminate in an `End` node or the bot hangs.
- Scenarios fire from ANYWHERE in the conversation — a too-loose
  `ScenarioGoodbye`/custom trigger can end conversations prematurely.
- CloseBot silently ignores a second scenario of the same type — check first.

## References
- `references/scenario-node-builders.md` — the `jq` builder for each of the
  four scenario types, standard response-chain pairings, sandbox test
  triggers, and common pitfalls.
