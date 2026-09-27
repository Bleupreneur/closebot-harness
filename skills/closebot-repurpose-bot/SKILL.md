---
name: closebot-repurpose-bot
description: Use when a CloseBot bot was DUPLICATED from another bot and now needs to be re-pointed at a different client or offer — phrases like "I duplicated [bot] for [client], update it", "repurpose this bot for the [offer] package", "this bot still has [other client]'s info in it", "make small tweaks since it was duplicated", "tweak the why-the-conversation and business info for [client]". A duplicate silently inherits the SOURCE bot's Job Information (business name, address, staff, pricing, deposit) verbatim — this skill finds that leftover data, pulls the NEW client's real facts from GHL, and swaps them in. Pairs the GHL business-facts lookup with the correct edit target most agents miss.
tools: [cb bot version, cb bot pull, cb bot push, cb bot audit]
---

# Skill: closebot-repurpose-bot

> Before changing anything, load the mental model: [`../../docs/HOW-CLOSEBOT-WORKS.md`](../../docs/HOW-CLOSEBOT-WORKS.md) (plugin install: `"$(cb root)/docs/HOW-CLOSEBOT-WORKS.md"`), especially §4, the safe change loop.

Repurpose a duplicated CloseBot bot for a new client/offer. Part find-and-
replace, part structural (removing a flow the new offer lacks), and the new
client's facts live in GHL, not CloseBot.

## When to use
- "I duplicated [bot] for [client], update it"
- "repurpose this bot for the [offer] package"
- "this bot still has [other client]'s info in it"

## Do not use when
- The bot is a diverged live bot (not a fresh duplicate) missing the
  canonical agent set → `closebot-apply-template`
- A single property needs changing → `closebot-edit-job-flow`
- Publishing the result → `closebot-publish-safely`

## Fast path — `scripts/cb-clone-repurpose.sh` (try this first)

Duplicates the source, swaps every booking calendar id (field + inline via
whole-tree `walk()`), find/replaces the old client name across node titles,
Statement bodies, scenario descriptions, MultiObjective prose, Method
`Sections[].Body`/`Instructions`, and both Job-Information shapes, then runs
the standard 5 pre-save validations. Preview first:
```bash
bash scripts/cb-clone-repurpose.sh <source_bot_id> "<New Bot Name>" \
  --ref <reference_bot_id> --cal <new_calendar_id> \
  --old-name "Old Client" --new-name "New Client" --dry-run
```
It deliberately does **not**: rewrite the why/important narrative for the new
offer, reconcile a deposit-flow node (structural), or re-attach the GHL source
(OAuth-gated) — it prints those as manual steps, including the persona gate.
Use the manual procedure below when unavailable or the swap is unusual.

## Procedure (manual path)
1. `cb bot version <id>` / `cb bot pull <id> --out steps.json` — see the
   leftover source data. Detect the Job Information shape by NON-EMPTY length
   and show the user the foreign client facts (wrong address, staff, pricing,
   a deposit that doesn't apply) — `references/repurpose-mechanics.md`.
2. `bash scripts/ghl-business-facts.sh <id> [--json]` — pull the NEW client's
   real facts from GHL. Never invent address/staff.
3. Swap the Job Information (shape-specific jq in
   `closebot-edit-job-flow/references/mutation-recipes.md#job-information`);
   note the source-vs-reference shape-mismatch nuance in
   `references/repurpose-mechanics.md` if the user gave a reference bot in a
   different shape than the duplicate.
4. Whole-payload old-name swap + leak-assert (`references/repurpose-mechanics.md`)
   — old name AND old calendar id must both be 0 across the whole file.
5. If the new offer drops a step the source had (e.g. no deposit), apply the
   structural delta — delete+splice or retitle+gut
   (`references/repurpose-mechanics.md`).
6. Run the 5 pre-save validations, diff vs. the clean original, then
   `cb bot push <id> steps.json` — same exit-3 semantics as
   `closebot-edit-job-flow` (invalidPaths → fix and retry; clobber message →
   close the editor tab and push again).
7. **Framework-parity gate (required):**
   `cb bot audit <id> --json | jq '.framework_parity.on_framework'` — `false`
   means splice via `closebot-apply-template` before reporting done.
8. **Leak-assert against the real audit fields** (there is no `.leaks` key):
   `cb bot audit <id> --json | jq '.job_information, .method_nodes'` plus a
   grep for the OLD client's name/calendar/price over `steps.json` — expect 0.
9. Report and hand off, surfacing the two duplicate-only hard gates
   (`references/repurpose-mechanics.md`): persona assignment (UI-only) blocks
   sandbox testing; source reassignment (OAuth-only) blocks correct live
   routing. Publishing goes through `closebot-publish-safely`.

## Tier
1 (mutating a reversible draft). GHL reads are Tier 0. Never calls Tier 2.

## Gotchas that shaped this skill
- Job Information is in `variables.business`, never the Method node.
- Source and reference bot can use different Job-Information shapes — write
  into the DUPLICATE's shape, not the reference's.
- A fresh duplicate can't sandbox-test until a persona is assigned in the UI
  (`no_persona`); never call the raw testSession messages long-poll directly.
- `cb bot audit --json` has no `.leaks` field — cross-check `.job_information`
  / `.method_nodes` plus a manual grep instead.

## References
- `references/repurpose-mechanics.md` — full Job-Information detection, the
  whole-payload swap + leak-assert, structural-delta removal, the
  framework-parity gate, the two publish blockers, and common pitfalls.
- `scripts/cb-clone-repurpose.sh` — the fast path (duplicate + mechanical
  re-point in one pass).
- `scripts/ghl-business-facts.sh` — pull a client's real GHL business facts.
- `$CLOSEBOT_DIR/.claude/workflows/closebot-clone-repurpose.md` — full ordered
  clone→repurpose→publish flow.
