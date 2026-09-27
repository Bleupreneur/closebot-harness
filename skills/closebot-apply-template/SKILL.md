---
name: closebot-apply-template
description: Use when the user wants to bring an EXISTING CloseBot bot up to your agency's template framework (the recommended agent-node set, as built in your template bot) — phrases like "make every bot like [reference bot]", "apply our template to [bot]", "this bot is missing the objection/transfer flow", "standardize [client]'s bot to match our template", "give [bot] the same framework as the others". Splices the reference framework's missing nodes into a target bot WITHOUT overwriting the client's own identity (calendar, offer, business facts), rewrites objection content for the client's offer, and flags the UI-only persona step. Distinct from closebot-repurpose-bot (which re-points a fresh duplicate) — this LEVELS UP an already-diverged live bot.
tools: [cb bot version, cb bot pull, cb bot push, cb bot audit]
---

# Skill: closebot-apply-template

> Before changing anything, load the mental model: [`../../docs/HOW-CLOSEBOT-WORKS.md`](../../docs/HOW-CLOSEBOT-WORKS.md) (plugin install: `"$(cb root)/docs/HOW-CLOSEBOT-WORKS.md"`), especially §4, the safe change loop.

Bring an existing bot up to your template framework while **keeping
every bit of the client's own identity**. Copy *structure + rules + tone*,
never copy the reference client's *facts*.

## The template has TWO layers

| Layer | Owner | What |
|---|---|---|
| 1. Framework + identity | You (API) | Reference node graph + wiring, with the target's calendar/offer/facts swapped in and objection copy rewritten for their offer |
| 2. Persona | User (UI) | Assign your standard persona — no API links a persona to a bot |

A bot is "on template" only when BOTH layers are done. You can complete Layer
1 end to end; you can only *flag* Layer 2.

## Template reference (you configure it)

The reference is **your own template bot** — the one bot in your account that
already has the full recommended agent-node set below. Point the tools at it:

```bash
export CB_TEMPLATE_BOT=bot_XXXXXXXXXXXXXXXX        # or put it in ./.env
# or: cp cb.config.example.json cb.config.json  →  { "templateBot": "bot_..." }
```

If `CB_TEMPLATE_BOT` is unset (and no `cb.config.json`), STOP and ask the user
which bot is their template. If they don't have one yet, build it first with
`closebot-build-job-flow`, check it with `cb bot audit <id> --json | jq
'.framework_parity.on_framework'` (must be `true`), then set it.

**Do NOT use a structurally thin bot as the reference** (≤2 Method nodes, e.g.
a starter "Template" bot) — thin references were the root cause of round-1
rebuilds shipping without the core agents. Your standard persona is UI-assign
only.

### Recommended agent-node set

The target MUST end with (titles vary — match by intent): `General Info
Collection` → `Booking Agent` (×2) → `Deposit Confirmation Agent` **or**
`Booking Readiness Agent` → `Handle Pricing` (MultiObjective); plus the
backbone `Pricing Inquiry` + global scenarios (`Aggression`,
`ai_booking_error`, `Human Handover`, `not_interested`) → `ModifyTags` →
`Transfer Message` → `End`.

## Do not use when
- The bot was freshly duplicated and just needs a new client's identity
  swapped in → `closebot-repurpose-bot` (re-points a fresh duplicate; this
  skill levels up an already-diverged live bot)
- A single property needs changing → `closebot-edit-job-flow`
- Publishing the result → `closebot-publish-safely`

## Procedure
1. Confirm the target `BOT_ID` and that the user actually wants it changed
   (skip any bots/accounts they've said are off-limits). Confirm
   `$CB_TEMPLATE_BOT` is set and is not the target.
2. `cb bot pull "$CB_TEMPLATE_BOT" --out tpl.json` (reference, read-only) and
   `cb bot pull <BOT_ID> --out tgt.json` (target's current draft). Diff the
   node lists (`references/splice.md`) and report the structural delta before
   editing.
3. `bash scripts/ghl-business-facts.sh <BOT_ID>` — pull the target client's
   real facts from GHL. Never carry the reference bot's calendar, address, or
   provider across.
4. Confirm the offer-specific forks with the user (deposit? invented facts to
   avoid? persona) — see `references/splice.md`.
5. Build the merged draft: the template's `nodes`+`edges`, target's `variables.business`,
   every template Method/MultiObjective rewritten for the target's offer, the template's
   calendar id swapped to the target's everywhere
   (field + inline + Instructions). Full mechanics in `references/splice.md`.
6. Run the 5 pre-save validations (`closebot-edit-job-flow`), diff vs. the
   target's clean original, then `cb bot push <BOT_ID> steps.json` — same
   exit-3 semantics (invalidPaths → fix and retry; clobber message → close the
   editor tab and push again).
7. `cb bot audit <BOT_ID> --json | jq '.framework_parity.on_framework'` —
   repeat splice/push until `true`. Never report a rebuild complete while this
   is `false`.
8. Report what was added, what client facts were used, what was deliberately
   left untouched. Flag both UI-only gates: assign your standard persona
   in the bot's UI dropdown; hand off publishing to
   `closebot-publish-safely` (never publish here).

## Tier
1 (mutating a reversible draft). GHL reads are Tier 0. Never calls Tier 2.

## Gotchas that shaped this skill
- Never use a thin bot as the reference — only a template bot that passes
  `framework_parity.on_framework == true` has the rich agent set.
- Persona and source reassignment are both UI-only hard gates — flag every
  time, don't imply the bot is done without them.
- Template-client brand text leaks into `variables.persona`, not just nodes — sweep it too.

## References
- `references/splice.md` — full step-by-step splice mechanics, the reference
  diff, GHL fact-pull, offer-fork questions, and common pitfalls.
- `references/agent-architect.md` — compression targets and the 5-step build
  process for measuring a rebuilt bot against the one it replaces.
- `references/exits-and-flow-connections.md` — why adopted edges
  dangle if `ExitPaths` isn't copied too.
- `references/api-save-ui-rendering-issue.md` — why a clean
  `invalidPaths:[]` doesn't guarantee the bot renders in the UI.
