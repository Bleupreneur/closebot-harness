---
name: closebot
description: Use when calling, integrating with, or building on the CloseBot.ai API — REST management endpoints (bots, leads, sources, library, billing, metrics) or the Live Message endpoint that drives conversations. Provides the full REST operation index (schema/endpoints.index.json), auth pattern, machine-readable schemas, per-domain markdown, and a CLI command spec. Auto-invoke whenever the user mentions CloseBot, closebot.ai, closebot.com, X-CB-KEY, or asks to send a message to a CloseBot-managed lead.
tools: [cb]
---

# CloseBot skill

**Read first:** [`../../docs/HOW-CLOSEBOT-WORKS.md`](../../docs/HOW-CLOSEBOT-WORKS.md)
(plugin install: `"$(cb root)/docs/HOW-CLOSEBOT-WORKS.md"`). It is the mental model
of how CloseBot operates: the object model, a lead's journey, what the API can't do,
the safe change loop, failure modes, which skill for which job, and a glossary. In
plugin mode this skill is the orientation, because the root `CLAUDE.md` isn't loaded.

Everything here is driven through the `cb` CLI — CLI-first, not raw curl,
not MCP. Run `cb help` for the group list, `cb help <group>` for one group's commands.

## `cb` and paths: folder mode vs plugin install

- **`cb`** in every closebot skill means `cli/cb` when you work inside the cloned repo
  (folder mode), or the `cb` the Claude Code plugin puts on PATH (plugin install, any
  project). Same CLI, same flags.
- **Harness root** (`$CLOSEBOT_DIR`): `scripts/`, `schema/`, `docs/`, `cli/` paths in
  skills are relative to it. Folder mode: the repo root. Plugin install: run
  `export CLOSEBOT_DIR="$(cb root)"` once, then `bash "$CLOSEBOT_DIR/scripts/<name>.sh"`.
- **Config:** plugin installs keep the key, template bot and sandbox ids in
  `~/.config/closebot/` (`cb init --global`) — the plugin folder is replaced on update.
  The user's project `.env` is never read.

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `CLOSEBOT_DIR` | the repo root (folder mode) or `$(cb root)` (plugin install) | Scripts and `cli/cb` live here |
| `CLOSEBOT_API_KEY` | — | Resolved env → `$CLOSEBOT_DIR/.env` → `~/.config/closebot/.env` |
| `CLOSEBOT_CONFIG_DIR` | `~/.config/closebot` | User-level config dir: `.env`, `cb.config.json`, `sandbox.json` |
| `CB_TEMPLATE_BOT` | — (or `cb.config.json` → `templateBot`) | Your template bot: the reference for `closebot-apply-template`, onboarding clones, and framework-gap hints |
| `AGENT_AUDIT_DIR` | — (optional) | Where audit-loop artifacts land, if you keep a separate audit workspace |

First-time setup: `cb init` (plugin install: `cb init --global`), then paste a key
created once at `https://app.closebot.com/settings?tab=keys` (not retrievable after)
into the `.env` it names. `cb doctor` confirms it.

## Start every session here

```bash
bash $CLOSEBOT_DIR/scripts/smoke.sh          # 9 read-only checks + drift check
bash $CLOSEBOT_DIR/scripts/smoke.sh --write  # adds a sandbox round trip
```
Optional: `node --test 'cli/test/**/*.test.mjs'` (the glob is required — a bare
`cli/test/` path breaks Node 22 module resolution).

## Two surfaces — never mixed

| Surface | Base URL | Auth | Notes |
|---|---|---|---|
| REST management | `https://api.closebot.com` | `X-CB-KEY` header | Bots, leads, sources, library, billing |
| Live message | `https://api.closebot.ai/message` | `X-CB-KEY` (or body `api_key`) | Drives real conversations; non-standard `410/420/430/440/450/460` statuses, mapped by `cb` |

## Tier rules

Tier 0 = `GET`, call freely. Tier 1 = mutating, state intent + show body (`--dry-run`)
first. Tier 2 = every `DELETE`, `POST /bot/{id}/publish`, billing refills — requires
`--confirm` on the same invocation, never chained with another Tier 2 call in one turn.
Sole exemption: `DELETE /bot/{botId}/testSession/{leadId}` — ephemeral test lead,
downgraded so `cb bot test`'s own cleanup runs without `--confirm`. Publish only through
`cb bot publish <id> --confirm`; the generated `bot post-publish` / `bot post-save` are
refused (exit 4) because a composite already owns that operation end-to-end —
`cb bot publish <id> --dry-run` runs pre-flight + diff for real and sends nothing.

## Routing table — prefer the dedicated skill over freestyle

| User intent | Skill |
|---|---|
| "What can CloseBot do / how do I call it" | `closebot` (this) |
| "What's in my account / map my system / inventory everything" | `closebot-map` (runs `cb doctor`, then `cb map`; Tier 0) |
| "Onboard / set up a CloseBot for [client]" | `closebot-onboard-client` |
| "Build a job flow / design a bot from scratch" | `closebot-build-job-flow` |
| "Edit / change / swap [property] on bot [id]" | `closebot-edit-job-flow` |
| "Bring [bot] up to our template framework" | `closebot-apply-template` |
| "This bot was duplicated for [client], repoint it" | `closebot-repurpose-bot` |
| "Upload docs / add FAQs / scrape [URL] for [client]" | `closebot-attach-knowledge` |
| "Add aggression / bot-detection / goodbye / custom scenario" | `closebot-add-scenario` |
| "Audit / read [bot]'s full config, framework parity, red flags" | `closebot-view-agent` |
| "Run pre-flight checks before I publish" | `closebot-pre-flight` |
| "Publish / ship / go live with [bot]" (Tier 2 gate) | `closebot-publish-safely` |
| "Bot is misbehaving / why is X happening" | `closebot-debug-bot` |
| "Update X across all bots / fleet-wide change" | `closebot-bulk-fanout` |
| "Audit, auto-tweak, and re-audit until clean" | `closebot-audit-loop` |
| "Grade real conversation quality, CB-XXX findings" | `closebot-quality-audit` |
| "A skill just ran — self-improve it / log a gotcha" | `skill-retro` |
| "Spec says X, API returned Y" (reference only) | `learned/rest-api-spec-drift` |
| Writing a brand-new `closebot-*` skill | `skills/_TEMPLATE.md` (template, not a skill) |

These delegate to each other where appropriate (e.g. onboarding calls
attach-knowledge for the KB step; every edit/build/repurpose skill ends at
`closebot-publish-safely` — never call the publish endpoint directly).

## Top-10 cheat sheet

| Goal | Command |
|---|---|
| List bots | `cb bot list` |
| Resolve the edit-target version | `cb bot version <id>` |
| Pull / push a job flow | `cb bot pull <id>` / `cb bot push <id> steps.json` |
| Sandbox-test a bot | `cb bot test <id> "message"` |
| Audit one bot (framework parity, red flags) | `cb bot audit <id> --json` |
| Publish (Tier 2) | `cb bot publish <id> --confirm` |
| Build/verify a bot's KB from a folder | `cb kb build --source <src> --from <dir>` / `cb kb verify --source <src>` (live-proven 2026-09-05 against the sandbox source `cli/sandbox.json` → `sourceId`; see GOTCHAS 2026-09-05) |
| List sources | `cb source get-source` |
| List leads / send a message | `cb lead get-lead-2` / `cb lead post-send-message --leadId <id>` |
| Toggle AI on/off for a lead | `cb lead put-ai-toggle --leadId <id>` |
| Refresh the spec from upstream | `cb spec refresh` |

## Vendor "CloseBot MCP" — docs only, not a control plane

`https://developers.closebot.com/mcp` is a Mintlify docs-search server, read-only,
cannot call the API. Its auto-generated skill resource is wrong on auth (says
`Authorization: Bearer`; real header is `X-CB-KEY`) and wrong on paths (says
`/bot/create-with-ai`; real is `/bot/ai`). Use it only as a spec-refresh input via
`cb spec refresh --source mcp` (untested fallback) — the authoritative spec is
`megastream25-api.closebot.com/swagger/v1/swagger.json`, pulled by the default
`cb spec refresh`.

## Template framework (recommended agent-node set)

Pick one bot in your account as your template and set `CB_TEMPLATE_BOT` (or
`cb.config.json` → `{"templateBot": "bot_..."}`). A good template is ~20 nodes.
Every client bot should carry the recommended agent-node set: General Info Collection,
Booking Agent (×2), Deposit Confirmation / Booking Readiness, and Handle Pricing
(MultiObjective), plus the backbone scenarios and handover. Check parity with
`cb bot audit <id> --json | jq .framework_parity.on_framework` — `false` means splice
via `closebot-apply-template`. Never call a rebuild done while this is `false`.

## Where to look

| Need | Location |
|---|---|
| Full machine-readable spec / node schema / examples | `$CLOSEBOT_DIR/schema/` |
| Per-domain endpoint reference | `$CLOSEBOT_DIR/docs/endpoints/<tag>.md` |
| Hand-built HTTP recipes (reference only — prefer `cb`) | `$CLOSEBOT_DIR/docs/playbooks/` |
| Endpoint risk tiers | `$CLOSEBOT_DIR/docs/SAFETY.md` |
| Known gotchas (human-reviewed) | `$CLOSEBOT_DIR/GOTCHAS.md` |
| Auto-logged unreviewed gotchas | `$CLOSEBOT_DIR/gotchas/auto.jsonl` (`cb gotcha review`) |
| CLI contract in full | `$CLOSEBOT_DIR/cli/README.md` |
