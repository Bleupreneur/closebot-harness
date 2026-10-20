# closebot-harness — Agent-Native Toolkit for the CloseBot API

This repo is a toolkit for calling, building on, or integrating with **CloseBot** — an AI chatbot platform for GoHighLevel agencies. Drag-and-drop "Job Flows" build conversational agents for SMS, web chat, FB Messenger, IG DM, WhatsApp, and email: lead qualification, appointment booking, agency-managed bots across many GHL sub-accounts. Loaded by Claude Code (`CLAUDE.md`) and by Codex and other coding agents (`AGENTS.md`) every time an agent works here.

> **Unofficial, community-built.** This toolkit is not affiliated with, endorsed by, or sponsored by CloseBot Inc. All APIs, endpoints, the OpenAPI spec (`schema/openapi.json`) and the CloseBot product names belong to CloseBot Inc. Every user needs their own CloseBot account and API key and is bound by [CloseBot's Terms of Service](https://closebot.com/terms-of-service/). See [`NOTICE`](./NOTICE).

**Read first:** [`docs/HOW-CLOSEBOT-WORKS.md`](./docs/HOW-CLOSEBOT-WORKS.md). It is the mental model of how CloseBot operates: the object model, a lead's journey, what the API can and can't do, the safe change loop, failure modes, which skill for which job, and a glossary.

## `cb` and paths: folder mode vs plugin install

- **`cb`** in every instruction here and in `skills/` means `cli/cb` when you work inside this cloned repo (folder mode: Claude Code, Codex, Cursor), or the `cb` the Claude Code plugin puts on PATH (plugin install, any project). Same CLI, same flags.
- **Harness root:** `scripts/`, `schema/`, `docs/` and `cli/` paths are relative to it. That's this repo in folder mode; `cb root` prints it in plugin mode (e.g. `bash "$(cb root)/scripts/smoke.sh"`).
- **Config:** key lookup is `CLOSEBOT_API_KEY` env var, then `<repo>/.env`, then `~/.config/closebot/.env` (`$CLOSEBOT_CONFIG_DIR` overrides). Plugin installs use the user-level dir (`cb init --global`), because the plugin folder is replaced on every update. A project's own `.env` is never read.

## CloseBot developer resources (consult these first)

Before guessing at an endpoint, a field, or a behavior, check CloseBot's own developer sources:

| Resource | What it is |
|---|---|
| [`developers.closebot.com/llms.txt`](https://developers.closebot.com/llms.txt) | Full doc index written for LLMs — start here |
| `developers.closebot.com/<page>.md` | Any docs page as markdown: append `.md` to the page URL (e.g. [`developers.closebot.com/.md`](https://developers.closebot.com/.md)) |
| [`developers.closebot.com/mcp`](https://developers.closebot.com/mcp) | Official CloseBot docs MCP server (streamable HTTP, read-only docs, no API key). Tools: `search_close_bot_api`, `query_docs_filesystem_close_bot_api`. Preconfigured in `.mcp.json` as `closebot-docs`. |
| [Swagger spec](https://megastream25-api.closebot.com/swagger/v1/swagger.json) | The live OpenAPI source; `cb spec refresh` re-pulls it into `schema/openapi.json` |
| [`docs.closebot.com`](https://docs.closebot.com) | Product help center (link to it; never copy its text into this repo) |

Order of truth: the live API behavior > the live Swagger / docs MCP > this repo's derived docs. If they disagree, the local copy is stale — refresh it.

## Two API surfaces

| Surface | Base URL | Purpose |
|---|---|---|
| **REST Management API** | `https://api.closebot.com` | Bots, agencies, billing, leads, sources, custom channels, library, metrics, dashboards, reports, FAQ, personas, webhooks. Full Swagger spec (131 paths, 182 ops). |
| **Live Message API** | `https://api.closebot.ai/message` | Single endpoint that drives conversations. Hand-built fragment in `schema/live-message.json`. |

## Authentication

The key lives in the repo-root `.env` file (gitignored), or in `~/.config/closebot/.env` for plugin installs (`cb init --global`). One-time setup:

```bash
cb init           # guided first-run setup
# or manually:
cp .env.example .env && chmod 600 .env
# edit .env and paste your key (CLOSEBOT_API_KEY=cb_...)
```

- Header name: `X-CB-KEY`. Generate keys at `https://app.closebot.com/settings?tab=keys` (one-time display, not retrievable).
- Keys are user-scoped, not agency-scoped — owners and team members each create their own.

## Start every session here

```bash
cb doctor                             # verifies key, connectivity and local setup — green = ready
bash scripts/smoke.sh                 # deeper read-only checks + drift check
node --test 'cli/test/**/*.test.mjs'  # optional — CLI unit tests (the glob is required)
cb map                                # optional — inventory of your agency (writes map/)
```

If doctor or smoke fails, fix before doing anything else. If they pass, you're cleared to read freely (Tier 0). Anything beyond reading goes through [`docs/SAFETY.md`](./docs/SAFETY.md).

Everything else — routing table, tier rules, cheat sheet, template framework, where to look — is in `skills/closebot/SKILL.md`; the CLI reference is `cli/README.md`; gotchas in `GOTCHAS.md`.

## Hard rules for any agent working here

1. **Run `cb doctor` (or `scripts/smoke.sh`) first** if you intend to make live calls. Don't try to act on a key you haven't verified.
2. **Classify every call by tier before making it** — see `docs/SAFETY.md`. Tier 0 = read freely. Tier 1 = state intent + show the body first. Tier 2 (DELETE, publish, billing) = require explicit user confirmation in the same turn; never chain Tier 2 calls.
3. **Prefer playbooks over freestyle.** If a task matches anything in `docs/playbooks/`, follow that playbook step-by-step rather than improvising sequencing.
4. **Never hardcode `X-CB-KEY`** — always read from `$CLOSEBOT_API_KEY`. Refuse to write a key into source files. Redact as `***` in any log/output.
5. **Refuse OAuth-only operations.** Adding a fresh CRM source (e.g., a brand-new GHL connection) is OAuth-flow only and is **not API-callable** per CloseBot's docs. Manage existing sources via `GET/PUT /agency/source/{id}` instead.
6. **Two base URLs are not interchangeable.** `api.closebot.com` is REST. `api.closebot.ai/message` is the live-message endpoint. Don't mix.
7. **Live message responses use non-standard codes** (410, 420, 430, 440, 450, 460). Treat them as documented status codes, not generic 4xx.
8. **Webhooks are user-defined**, not platform-published. There's no event subscription API. The Custom Webhook Job Flow node POSTs/GETs to URLs the user supplies inside the bot designer.
9. **Always cite the endpoint** when proposing actions: `POST /bot/{id}/publish` not "publish the bot". Future agents read each other's citations.
10. **Spec drift is real.** If a call returns 404 or an unexpected schema, re-fetch the spec (`cb spec refresh`) and check the docs MCP before debugging the call.
11. **Publish only via `cb bot publish <id> --confirm`** (the only sanctioned publish path; the generated `bot post-publish` is refused).
12. **Duplicated bots have two non-API gates — surface them, don't silently skip.** (a) **Persona:** a fresh duplicate inherits an unusable persona reference, so the sandbox returns `no_persona` until a persona is assigned in the **UI** (UI-only — `PUT /persona/{id}` has an irreversible default-flip side effect). (b) **Source:** a duplicate stays attached to the SOURCE bot's GHL source, so `{{location.*}}` and live routing resolve to the WRONG client until re-attached in the UI (OAuth-only, per rule 5). The `closebot-repurpose-bot` skill flags both.
13. **Verify template parity, don't assume it.** A bot can be identity/offer/calendar/leak-clean yet **structurally thin** (missing the recommended agent nodes). "Done" for any repurpose/clone/onboard/apply-template is BOTH layers: correct identity/offer + zero leaks, AND the recommended agent-node set present. Never declare a rebuild complete while `cb bot audit` reports a framework gap.
14. **Every API call goes through `cb`.** Raw curl only inside `docs/playbooks/` reference blocks.
15. **Never commit your own ids or client data.** Bot/source ids, lead data, and client names belong in gitignored local files (`.env`, `cb.config.json`, `cli/sandbox.json`, `map/`), never in tracked files or PRs.

## Template framework

You choose your own reference bot — the proven bot every new or repurposed client bot should match structurally. Set it once:

```bash
export CB_TEMPLATE_BOT=bot_XXXXXXXXXXXXXXXX
# or: cb init --template bot_XXXXXXXXXXXXXXXX   (writes cb.config.json; plugin installs: cb init --global --template ...)
```

It is the reference for `closebot-apply-template`, `closebot-repurpose-bot` (and its one-pass clone workflow, `.claude/workflows/closebot-clone-repurpose.md` + `scripts/cb-clone-repurpose.sh`), and `closebot-onboard-client`. If neither is set, ask the user; never fall back to a thin starter bot. Recommended agent-node set a production bot should have: an entry qualify-and-collect agent (general info collection), a booking agent (drive + confirm), a booking-readiness or deposit-confirmation agent, and a pricing/objection agent (MultiObjective), plus the backbone scenarios (aggression, booking error, human handover, not interested) → ModifyTags → Transfer Message → End. Check with `cb bot audit <id> --json | jq '.framework_parity.on_framework'`.

## Sandbox

Write-mode tests only run against ids in `cli/sandbox.json` (gitignored — copy `cli/sandbox.example.json` and follow its setup note; plugin installs: `~/.config/closebot/sandbox.json` via `cb init --global --sandbox`). `scripts/smoke.sh --write` uses it. `cb` refuses write tests against any id not listed there, and refuses to publish any id that is listed; the sandbox bot must never go live. Test sessions (`cb bot test`, `cb bot session-*`) run in CloseBot's isolated test mode and work on any bot, so a client bot can be tested before it is published.

## Closing a session (checklist)

1. `cb doctor` / `bash scripts/smoke.sh` — all checks green.
2. `node --test 'cli/test/**/*.test.mjs'` — 0 failures.
3. `git status` — no `.env`, `cb.config.json`, `cli/sandbox.json`, or `map/` output staged.
4. `.env` must stay mode 600.

## Regenerating the package

```bash
cb spec refresh   # pulls the latest Swagger + rebuilds all derived artifacts
# fallback: curl -fsSL https://megastream25-api.closebot.com/swagger/v1/swagger.json -o schema/openapi.json && python3 scripts/build.py
```

`schema/openapi.json` is fetched from CloseBot's public Swagger endpoint and remains CloseBot's.

## Gap registry — known `[INCOMPLETE]`

- Rate limits — no public documentation found.
- `460 Account Limit` exact threshold — status code listed but threshold undocumented.
- `POST /webhook/event/{sourceId}` payload schema — endpoint exists, payload not in Swagger.
- OAuth flow for CRM source connection — mentioned in docs, no spec published.

Check the docs MCP / `llms.txt` before treating any of these as still open.
