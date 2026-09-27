# closebot-harness

An agent-native command-line toolkit for running a **CloseBot** agency. Install it as a Claude Code plugin, or drop any AI coding assistant (Claude Code, Codex, Cursor, Aider) into this folder, and it can map your account, onboard new clients, update existing ones, edit job flows, manage knowledge bases, and pull metrics, without clicking through dashboards.

> **Unofficial and community-built.** This project is **not affiliated with, endorsed by, or sponsored by CloseBot Inc.** All APIs, endpoints, the OpenAPI spec and the CloseBot product names belong to CloseBot Inc. What this project adds is the agent system on top: the `cb` CLI, schema tooling, skills, playbooks, workflows and safety model that let an AI agent map, build and manage CloseBot bots. To use this toolkit you need your own CloseBot account and API key, and your use of the CloseBot API is governed by [CloseBot's Terms of Service](https://closebot.com/terms-of-service/). For product documentation, go to CloseBot's own docs at [docs.closebot.com](https://docs.closebot.com) and [developers.closebot.com](https://developers.closebot.com). See [`NOTICE`](./NOTICE).

> **New to this?** Start with [`GETTING-STARTED.md`](./GETTING-STARTED.md).

---

## Quick start

Requires Node 22+ (zero npm dependencies). The helper scripts also need `bash`, `curl` and `jq`.

### Option 1: Install as a Claude Code plugin (recommended)

The CloseBot expert then loads in **any** project, not just this folder. In Claude Code:

```text
/plugin marketplace add Bleupreneur/closebot-harness
/plugin install closebot-harness@closebot-harness
```

(From a shell: `claude plugin marketplace add Bleupreneur/closebot-harness && claude plugin install closebot-harness@closebot-harness`.)

You get the 17 skills (namespaced `closebot-harness:*`), the `cb` CLI on the Bash tool's PATH, and the CloseBot docs MCP server. Then, in any project, ask Claude to run:

```bash
cb init --global   # creates ~/.config/closebot/.env (mode 600, dir 700); paste your CLOSEBOT_API_KEY into it
cb doctor          # verifies key, connectivity and setup; says which config file it used
cb map             # full inventory of your agency, written to ./map/ in the current project
```

Plugin installs keep your key, template bot and sandbox ids in `~/.config/closebot/` (override with `CLOSEBOT_CONFIG_DIR`), because the plugin folder is replaced on every update. `cb` never reads your project's own `.env`. `cb root` prints where the plugin is installed, if you want to run a bundled script (`bash "$(cb root)/scripts/smoke.sh"`).

**Plugin-mode notes**

- **Updates:** installed users only get a new release when `version` in `.claude-plugin/plugin.json` changes. Maintainers must bump it on every release (see [`CONTRIBUTING.md`](./CONTRIBUTING.md#releases)).
- **Learnings don't persist locally.** Gotchas and self-heal edits (`cb gotcha add`, the `CB_SELF_HEAL=1` hooks, skill-retro fixes) are written into the plugin cache, which is replaced on every update. To keep a learning, open a PR upstream. If you want local edits to persist, use folder mode instead.
- **Pick one mode per project.** Don't use the plugin install and folder mode in the same project, or the hooks fire twice.

### Option 2: Folder mode (Claude Code, Codex, Cursor)

```bash
git clone https://github.com/Bleupreneur/closebot-harness.git
cd closebot-harness
cli/cb init      # creates .env (mode 600) from .env.example; then paste your CLOSEBOT_API_KEY into it
cli/cb doctor    # verifies key, connectivity and local setup; green = connected
cli/cb map       # full inventory of your agency: sources, bots, versions, flows, KB, metrics
```

`cb map` prints a summary and writes the full map into `map/` (gitignored), including a markdown report, JSON, and a mermaid diagram. It's the fastest way to give an agent a picture of your whole account.

Manual alternative to `cb init`: `cp .env.example .env && chmod 600 .env`, then paste `CLOSEBOT_API_KEY=cb_...` into `.env`. Generate a key at [app.closebot.com/settings?tab=keys](https://app.closebot.com/settings?tab=keys).

**`cb` in the rest of this README** means `cli/cb` in folder mode and plain `cb` in a plugin install.

### Windows

`cb` is pure Node and runs anywhere. Two things need care on a native Windows clone:

- **Skills in folder mode** are exposed through symlinks (`.claude/skills` and `.agents/skills` point at `skills/`), which Git on Windows checks out as plain text files unless symlinks are enabled. Use the **plugin install** (Claude Code reads `skills/` directly, no symlinks), use **WSL**, or clone with `git clone -c core.symlinks=true https://github.com/Bleupreneur/closebot-harness.git` (needs Developer Mode or an elevated shell).
- **Helper scripts** (`scripts/*.sh`, the self-healing hooks) are bash: run them from Git Bash or WSL.

---

## Why this exists

If you run a CloseBot agency with more than two clients, you've felt the pain: every new onboarding is the same six tabs of clicking, and every "small change for client X" is another 20 minutes in the UI.

| Before | After |
|---|---|
| 30-min UI walkthrough to onboard a new client | [`docs/playbooks/12-onboard-new-client.md`](./docs/playbooks/12-onboard-new-client.md): duplicate your template, customize, attach KB, test, publish |
| Hunting through dropdowns to swap a calendar ID across 4 nodes | `cb bot pull`, a `jq` edit, `cb bot push` (verified save) |
| Re-uploading the same KB to 6 clients | `cb kb build --source <src> --from ./kb` per source |
| "Wait, what's our credit balance?" | `cb billing get-balance` (`GET /agency/billing/balance`) |
| AI assistant hallucinates an endpoint that doesn't exist | Agent reads `schema/endpoints.index.json` and the official docs MCP first, grounded on all 182 real operations |

---

## CloseBot developer resources

CloseBot publishes developer docs built for agents. Agents working in this repo are told to consult these **before** guessing:

| Resource | URL |
|---|---|
| Doc index for LLMs | https://developers.closebot.com/llms.txt |
| Docs as markdown (append `.md` to any page URL) | https://developers.closebot.com/.md |
| Official docs MCP server (streamable HTTP, read-only, no API key; tools `search_close_bot_api`, `query_docs_filesystem_close_bot_api`) | https://developers.closebot.com/mcp |
| Swagger / OpenAPI spec | https://megastream25-api.closebot.com/swagger/v1/swagger.json |
| REST API base | https://api.closebot.com |
| API keys | https://app.closebot.com/settings?tab=keys |
| Help center | https://docs.closebot.com |

This repo ships a [`.mcp.json`](./.mcp.json) that registers the docs MCP as `closebot-docs`, so Claude Code (and other harnesses that read `.mcp.json`) pick it up automatically in this folder. To add it elsewhere:

```bash
# Claude Code
claude mcp add --transport http closebot-docs https://developers.closebot.com/mcp

# Codex (~/.codex/config.toml)
# [mcp_servers.closebot-docs]
# url = "https://developers.closebot.com/mcp"

# Cursor (.cursor/mcp.json or ~/.cursor/mcp.json)
# { "mcpServers": { "closebot-docs": { "url": "https://developers.closebot.com/mcp" } } }
```

---

## What's in the box

| Asset | What it gives you |
|---|---|
| **`cli/cb`** | The CLI. Every API call goes through it: tier-gated writes, `--dry-run`, key masking. Includes `init`, `doctor`, `map`, `root`, plus generated commands for all 182 operations. Reference: [`cli/README.md`](./cli/README.md) |
| **`.claude-plugin/`**, **`bin/cb`**, **`hooks/`** | Claude Code plugin packaging: the plugin and marketplace manifests, the `cb` wrapper the plugin puts on PATH, and the opt-in self-healing hooks (`CB_SELF_HEAL=1`) |
| **`GETTING-STARTED.md`** | 10-minute setup walkthrough |
| **`CLAUDE.md`** / **`AGENTS.md`** | Auto-loaded orientation, hard rules and resources for Claude Code / Codex (usable as a system prompt for any agent) |
| **`skills/`** | Agent skills (`closebot`, `closebot-onboard-client`, `closebot-edit-job-flow`, `closebot-publish-safely`, ...). `.claude/skills` and `.agents/skills` are symlinks to `skills/` for harness discovery |
| **`docs/HOW-CLOSEBOT-WORKS.md`** | **Read first.** The mental model: object model, a lead's journey, API vs UI-only, safe change loop, failure modes, skill routing, glossary |
| **`docs/SAFETY.md`** | Risk tiers (Tier 0 read, Tier 1 mutate, Tier 2 publish/destructive) for every endpoint |
| **`docs/CLIENT-MANAGEMENT.md`** | Lifecycle guide: organize, onboard, update, duplicate, adjust, publish, measure |
| **`docs/AGENT-BUILDING.md`** | Job-flow model, node types, account tools, common patterns |
| **`docs/playbooks/`** | 12 numbered, step-by-step recipes for common tasks |
| **`docs/endpoints/`** | Per-tag reference (23 files) generated from the spec |
| **`schema/openapi.json`** | CloseBot's OpenAPI spec as fetched from their public Swagger endpoint (131 paths, 182 ops). Remains CloseBot's; see [`NOTICE`](./NOTICE) |
| **`schema/endpoints.index.json`** | Flat one-line-per-endpoint index for fast agent lookup |
| **`schema/node-descriptors.json`** | Job-flow node descriptors |
| **`schema/live-message.json`** | Hand-built spec for `api.closebot.ai/message` (not in the Swagger) |
| **`scripts/smoke.sh`** | Read-only sanity and drift checks |
| **`scripts/build.py`** | Regenerates all derived docs from `schema/openapi.json` |
| **`evals/`** | 25 tasks that check whether an agent using this harness acts like a CloseBot expert. Validate with `node evals/check.mjs --validate`; see [`evals/README.md`](./evals/README.md) |
| **`cb.config.example.json`** | Copy to `cb.config.json` (gitignored) to set your template bot |

---

## What can you do with it?

### Map your account

```bash
cb map          # agency, sources, bots + versions, job-flow summary, personas, KB/FAQ/library counts, metrics
```

### Onboard a new client from your template bot

Set your proven template bot once, either `export CB_TEMPLATE_BOT=bot_XXXXXXXXXXXXXXXX` or `cp cb.config.example.json cb.config.json` and fill in `templateBot`. Then ask your agent to run the `closebot-onboard-client` skill, or follow [`docs/playbooks/12-onboard-new-client.md`](./docs/playbooks/12-onboard-new-client.md):

```bash
cb bot post-duplicate --id "$CB_TEMPLATE_BOT"   # Tier 1
# ...edit the dials (calendar, prompts, tool flags, tags), attach the source in the UI...
cb kb build --source src_XXXXXXXXXXXXXXXX --from ./client-kb
cb bot test bot_XXXXXXXXXXXXXXXX "Hi, can I book a consult?"   # sandbox only
cb bot publish bot_XXXXXXXXXXXXXXXX --dry-run                  # preview
cb bot publish bot_XXXXXXXXXXXXXXXX --confirm                  # Tier 2, human-confirmed
```

### Edit a bot's job flow

```bash
cb bot pull bot_XXXXXXXXXXXXXXXX --out steps.json   # latest draft version, never a hardcoded 0.0.1
# ...mutate steps.json with jq...
cb bot push bot_XXXXXXXXXXXXXXXX steps.json          # saves, re-pulls, verifies it landed
cb bot audit bot_XXXXXXXXXXXXXXXX                    # red flags + template parity
```

### Look anything up

```bash
cb help              # command groups
cb help bot          # every bot command with method, path and tier
cb bot get-bot --dry-run   # show the exact request (key masked) without sending
```

More patterns: [`docs/CLIENT-MANAGEMENT.md`](./docs/CLIENT-MANAGEMENT.md) and [`docs/AGENT-BUILDING.md`](./docs/AGENT-BUILDING.md).

---

## The two API surfaces (keep them straight)

| Surface | URL | Use for |
|---|---|---|
| **REST Management** | `https://api.closebot.com` | Everything administrative: bots, sources, leads, KB, billing, metrics, dashboards, reports (131 paths, 182 ops) |
| **Live Message** | `https://api.closebot.ai/message` | Single POST that drives real conversations (SMS, web, FB, IG, WhatsApp, email) |

Auth is the same for both: `X-CB-KEY: $CLOSEBOT_API_KEY`. Don't mix the base URLs.

---

## Hard rules (every agent operating in this folder must follow)

1. **Run `cb doctor` (or `scripts/smoke.sh`) first** before any live call.
2. **Classify by tier** ([`docs/SAFETY.md`](./docs/SAFETY.md)): Tier 0 (GET) free. Tier 1 (POST/PUT) state intent and show the body. Tier 2 (DELETE, publish, billing) explicit confirmation in the same turn, never chained.
3. **Prefer playbooks** over freestyle sequencing.
4. **Never hardcode the key.** Always `$CLOSEBOT_API_KEY`; redact as `***` in any output.
5. **Refuse OAuth-only operations.** Adding a fresh GHL source is UI-only.
6. **Cite the exact endpoint** (`POST /bot/{id}/publish`) when proposing actions.
7. **Spec drift is real.** If a call returns 404 or an odd schema, run `cb spec refresh` and check the docs MCP before debugging.
8. **Publishing is always human-confirmed** via `cb bot publish <id> --confirm`.

Full rules and rationale: [`CLAUDE.md`](./CLAUDE.md).

---

## Ways to use this

### A) As a Claude Code plugin (any project)

Install it once (see [Quick start](#option-1-install-as-a-claude-code-plugin-recommended)) and the skills, `cb` and the docs MCP are available in every Claude Code session. Note that a plugin does not load `CLAUDE.md`; the `closebot` skill carries the orientation, tier rules and routing table instead.

### B) As an AI agent's working directory

Open this folder in Claude Code, Codex or Cursor. The agent gets the rules, skills, endpoint index and the official docs MCP pre-wired. Ask in plain English:

> "Map my account, then duplicate my template bot for a new med spa client called Acme, swap the calendar to `cal_xyz`, upload these 3 PDFs to their KB, and run a test conversation in the sandbox."

### C) As a manual reference

Open any playbook in `docs/playbooks/` and run the commands yourself. Every recipe works without AI.

---

## Staying current with the API

```bash
cb spec refresh             # re-pulls CloseBot's live Swagger, diffs it, rebuilds derived docs
cb spec refresh --dry-run   # show the diff only
```

This regenerates `schema/openapi.yaml`, `schema/endpoints.index.json`, `docs/endpoints/*.md` and `cli/closebot-cli.spec.yaml`/`.json`. Removed operations are refused unless you pass `--allow-removals`.

---

## Endpoint inventory (182 REST ops + live message)

| Tag | Ops | Reference |
|---|---:|---|
| Account | 3 | [`account.md`](./docs/endpoints/account.md) |
| AccountNotification | 2 | [`accountnotification.md`](./docs/endpoints/accountnotification.md) |
| Agency | 5 | [`agency.md`](./docs/endpoints/agency.md) |
| Analytics | 6 | [`analytics.md`](./docs/endpoints/analytics.md) |
| Billing | 14 | [`billing.md`](./docs/endpoints/billing.md) |
| Bot | 24 | [`bot.md`](./docs/endpoints/bot.md) |
| BotMetric | 12 | [`botmetric.md`](./docs/endpoints/botmetric.md) |
| BotSourceVariable | 2 | [`botsourcevariable.md`](./docs/endpoints/botsourcevariable.md) |
| BotTemplate | 1 | [`bottemplate.md`](./docs/endpoints/bottemplate.md) |
| BotTesting | 8 | [`bottesting.md`](./docs/endpoints/bottesting.md) |
| Dashboard (new) | 5 | [`dashboard.md`](./docs/endpoints/dashboard.md) |
| Hierarchy | 5 | [`hierarchy.md`](./docs/endpoints/hierarchy.md) |
| Lead | 19 | [`lead.md`](./docs/endpoints/lead.md) |
| Leaderboard (new) | 3 | [`leaderboard.md`](./docs/endpoints/leaderboard.md) |
| Library | 19 | [`library.md`](./docs/endpoints/library.md) |
| LiveDemo | 10 | [`livedemo.md`](./docs/endpoints/livedemo.md) |
| Notification | 5 | [`notification.md`](./docs/endpoints/notification.md) |
| Persona | 5 | [`persona.md`](./docs/endpoints/persona.md) |
| Report (new) | 8 | [`report.md`](./docs/endpoints/report.md) |
| SmartFAQ | 5 | [`smartfaq.md`](./docs/endpoints/smartfaq.md) |
| Source | 15 | [`source.md`](./docs/endpoints/source.md) |
| SourceChannel | 5 | [`sourcechannel.md`](./docs/endpoints/sourcechannel.md) |
| Webhook | 1 | [`webhook.md`](./docs/endpoints/webhook.md) |
| **Total** | **182** | |
| LiveMessage | 1 | [`schema/live-message.json`](./schema/live-message.json) |

---

## Security and contributing

- Never paste an API key into an issue, PR or log. See [`SECURITY.md`](./SECURITY.md) for how to report a vulnerability.
- PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md). No client data or real ids in PRs.

---

## License and attribution

The toolkit code and original documentation are MIT licensed. See [`LICENSE`](./LICENSE).

CloseBot and related names are the property of CloseBot Inc. `schema/openapi.json` and the docs derived from it (`docs/endpoints/`, `schema/endpoints.index.json`, the CLI spec) are generated from CloseBot's published API spec for interoperability and are **not** covered by the MIT grant. See [`NOTICE`](./NOTICE).
