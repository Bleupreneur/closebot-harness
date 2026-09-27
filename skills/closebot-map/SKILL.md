---
name: closebot-map
description: Use when the user wants the big picture of their CloseBot account — phrases like "what's in my CloseBot account", "map my system", "give me an overview of all my bots", "inventory my sources/bots/KB", "where do I start", "health check my account". Runs `cb doctor` then `cb map`, which writes a read-only inventory (agency, sources + channels, bots + versions, node-type histograms, framework parity, personas, KB/Smart FAQ counts, optional 30-day metrics) to map/<agency>-<date>/ as map.json, MAP.md and a mermaid diagram, then summarizes it and proposes next actions. Tier 0, GET only, never mutates or publishes.
tools: [cb doctor, cb map, cb bot audit]
---

# Skill: closebot-map

Build a map of the user's whole CloseBot system in one pass, then turn it
into a short, prioritized to-do list that hands off to the right skill. This
skill only reads. It never edits, saves, attaches, or publishes.

## When to use
- "what's in my CloseBot account?" / "map my system" / "show me everything"
- "inventory everything" / "health check my bots" / "which bots need work?"
- First session with a new account, before any edit — map first, then act
- After a batch of changes, to confirm nothing regressed account-wide

## Do not use when
- Reading ONE bot in depth (prompts, section wording, graph) → `closebot-view-agent` (`cb bot audit <id>`)
- Testing how a bot actually talks to leads → `closebot-quality-audit`
- Fixing something specific you already know about → the fixing skill directly (see Hand-offs)

## Procedure
1. `cb doctor` — must end with no `[fail]` lines. If it fails:
   - no `.env` → `cb init`, then ask the user to paste their key into `.env`
     (created at https://app.closebot.com/settings?tab=keys). Never ask them to paste the key into chat.
   - `.env` mode → `chmod 600 .env`
   - key rejected (401/403) → they need a new key; stop here.
   - `[warn]` lines (spec drift, sandbox, template bot) do not block the map.
2. `cb map` — whole account. Options:
   - `--bot <bot_id>` to map one bot and its sources
   - `--no-steps` for a fast pass on large accounts (no node counts / framework check)
   - `--metrics` to add last-30-day message and action counts
   - `--json` to print map.json to stdout instead of writing files
3. Read `map/<agency-slug>-<date>/MAP.md` (path is printed by `cb map`).
4. Summarize for the user in this order, keeping it short:
   - One line of totals (sources, bots, personas, library files, Smart FAQs).
   - Every `FAIL` issue, grouped by bot.
   - `WARN` issues, grouped by code, with bot names.
   - `INFO` items only if the user asked for everything.
   - Any rows under **Errors** — say which reads failed; the map is partial there.
5. Propose next actions, one per issue group (see Hand-offs), highest severity first.
   Ask which to start with. Do not start fixing unprompted.

## Hand-offs
| Issue code in MAP.md | Next step |
|---|---|
| `FRAMEWORK_GAP`, `NODE_TYPE_GAP` | `cb bot audit <id>` then `closebot-apply-template` (needs a template bot: `cb init --template <bot_id>`) |
| `ORPHAN_NODE`, other job-flow edits | `closebot-edit-job-flow` |
| `NO_KB`, `LIBRARY_OFF`, `KB_NOT_READY` | `closebot-attach-knowledge` |
| `NO_PERSONA` | assign a persona in the CloseBot UI (no API path), then re-run `cb map --bot <id>` |
| `DRAFT_NEWER_THAN_LIVE`, `NEVER_PUBLISHED` | review the draft (`cb bot audit <id>`), then `closebot-publish-safely` — Tier 2, needs the user's explicit confirmation |
| `SOURCE_DISCONNECTED`, `SOURCE_NO_BOT` | UI-only (source OAuth / attaching a bot to a source) — tell the user |
| "is the bot actually good?" | `closebot-quality-audit` |

## Tier
0 — GET only. `cb map` never writes to CloseBot. It writes local files under
`map/`, which hold the user's own ids and names: never commit `map/` or paste
its contents into a public place.

## Gotchas that shaped this skill
- `GET /agency/source` is projected to 4 fields for normal CLI use; `cb map` drops that projection for this one read so it can see bots/connected/topicsEnabled, then keeps only safe fields itself.
- Library `fileStatus` has no documented enum; live ready files report `indexed`. Both `indexed` and `ready` count as ready (same rule as `cb kb verify`).
- `GET /bot/{id}/steps` 400s without `botVersion`; the map always passes the resolved edit target (highest semver, see `cb bot version`), so node counts describe the draft the user is editing, not necessarily what is live.
- Framework parity matches by title intent (General Info / Booking Agent / deposit-or-readiness / pricing objective), the same rule as `scripts/cb-view-agent.sh`.

## References
- `cli/README.md` → "First run: init, doctor, map" — flags and output format
- `cli/lib/map.mjs` header — the exact list of GET operations the map uses
