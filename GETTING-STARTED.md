# Getting started

This guide takes you from zero to "I can see and manage my CloseBot bots from the command line" in about 10 minutes. There are two ways to install `closebot-harness`: as a **Claude Code plugin** (recommended; works in any project) or as a **folder** you open in Claude Code, Codex or Cursor.

> This is an unofficial, community-built toolkit. It is not affiliated with, endorsed by, or sponsored by CloseBot Inc. You need your own CloseBot account and API key, and you are bound by [CloseBot's Terms of Service](https://closebot.com/terms-of-service/).

If you've never used CloseBot before, read CloseBot's own [help center](https://docs.closebot.com) first to understand what the platform does.

---

## What this toolkit gives you

A single folder you can drop any AI agent (Claude Code, Codex, Cursor, etc.) into and have it manage your CloseBot agency:

- **Map your account**: every source, bot, version, job flow, persona, KB and metric in one report
- **Onboard new clients**: duplicate your proven template bot, swap calendar + brand + KB, publish
- **Update existing clients**: edit FAQs, upload new docs, scrape new pages, adjust job flow nodes
- **Build new agents**: reference for the job-flow node types and account tools

Everything is API-driven, every write is tier-gated, and publishing always requires your explicit confirmation.

---

## Prerequisites

| Need | How to get it |
|---|---|
| **CloseBot account** | Sign up at [closebot.com](https://closebot.com). API access depends on your plan; check CloseBot's pricing page. |
| **CloseBot API key** | Generated in-app, see step 2. |
| **Node 22+** | The CLI has zero npm dependencies. |
| **macOS / Linux / WSL** | `cb` is pure Node and runs anywhere. The helper scripts and hooks use bash: on native Windows run them from Git Bash or WSL. See [Windows](#windows) for the skills symlinks. |
| **`curl`**, **`jq`** | `brew install jq` (macOS), `apt install jq` (Debian/Ubuntu). Used by the helper scripts. |
| **`python3`** | Only needed to regenerate derived docs after a spec refresh. |
| **A GHL agency** (recommended) | CloseBot is built for GoHighLevel. Most playbooks assume a GHL source exists. |

---

## Step 1: Install the toolkit

### Option A: Claude Code plugin (recommended)

In Claude Code:

```text
/plugin marketplace add Bleupreneur/closebot-harness
/plugin install closebot-harness@closebot-harness
```

Or from a shell: `claude plugin marketplace add Bleupreneur/closebot-harness`, then `claude plugin install closebot-harness@closebot-harness`. Start a new session (or run `/reload-plugins`).

This gives every Claude Code session, in any project, the 17 CloseBot skills (named `closebot-harness:closebot`, `closebot-harness:closebot-map`, ...), the `cb` CLI on the Bash tool's PATH, and the official CloseBot docs MCP server. Your settings live in `~/.config/closebot/`, not in the plugin folder, because Claude Code replaces the plugin folder on every update.

### Option B: Folder mode (Claude Code, Codex, Cursor)

```bash
git clone https://github.com/Bleupreneur/closebot-harness.git
cd closebot-harness
```

If you forked it, replace `Bleupreneur` with your username. In folder mode the CLI is `cli/cb`; in the rest of this guide, read `cb` as `cli/cb`.

### Windows

- **Plugin install** works on native Windows: Claude Code reads `skills/` directly.
- **Folder mode** exposes the skills through symlinks (`.claude/skills` and `.agents/skills` → `skills/`). A default Windows clone checks symlinks out as plain text files, so the skills don't load. Use WSL, or clone with symlinks enabled: `git clone -c core.symlinks=true https://github.com/Bleupreneur/closebot-harness.git` (needs Developer Mode or an elevated shell).
- `cb` is pure Node. The `scripts/*.sh` helpers and the self-healing hooks need bash: Git Bash or WSL.

---

## Step 2: Get your CloseBot API key

1. Log in to [app.closebot.com](https://app.closebot.com).
2. Open the API keys settings: [app.closebot.com/settings?tab=keys](https://app.closebot.com/settings?tab=keys).
3. Generate a new key, give it a label (e.g. "closebot-harness"), and copy the value.
4. **Copy it now.** The key is shown exactly once. If you lose it, revoke it and generate a new one.

The key is scoped to **your user**, not your agency. If several team members use the toolkit, each generates their own key. The same key works on both API surfaces: `api.closebot.com` (REST management) and `api.closebot.ai/message` (live conversations).

---

## Step 3: Set up (`cb init`)

**Plugin install** (ask Claude to run it, or run it with `!` in Claude Code):

```bash
cb init --global
```

This creates `~/.config/closebot/.env` (file mode 600, directory mode 700; set `CLOSEBOT_CONFIG_DIR` to use another directory). In a plugin install plain `cb init` does the same thing. Open that file and paste your key after `CLOSEBOT_API_KEY=`. `cb` never reads your project's own `.env`.

**Folder mode:**

```bash
cli/cb init
```

This creates `.env` from `.env.example` (mode 600, gitignored) in the repo. Either way, `cb init` never overwrites an existing file and never reads or prints the key. Key lookup order: `CLOSEBOT_API_KEY` env var, then the repo `.env`, then `~/.config/closebot/.env`.

Manual alternative (folder mode):

```bash
cp .env.example .env
chmod 600 .env
# then edit .env:
CLOSEBOT_API_KEY=cb_yourkeyhere
```

The `.env` file is gitignored and will never be committed. Don't paste your key anywhere else.

---

## Step 4: Check your setup (`cb doctor`)

```bash
cb doctor
```

Green output means your key is valid, the API is reachable, and your local setup is correct. If something fails, doctor tells you what broke and how to fix it. Most failures are key-related (typo, revoked key, missing `cb_` prefix).

For a deeper read-only check, including spec drift against CloseBot's live Swagger:

```bash
bash scripts/smoke.sh               # folder mode
bash "$(cb root)/scripts/smoke.sh"  # plugin install
```

---

## Step 5: Map your system (`cb map`)

```bash
cb map
```

This is read-only (Tier 0). It prints an inventory of your account (agency, sources, bots and versions, job-flow node summary, personas, KB/FAQ/library counts, metrics) and writes the full report to `map/` as markdown, JSON and a mermaid diagram. In folder mode `map/` is in the repo and gitignored because it contains your real data. In a plugin install it goes to `map/` under your current project (use `--out <dir>` to choose); keep it out of that project's git history too.

Hand `map/` to your AI agent as context and it knows your whole system.

---

## Step 6: First commands

All of these are Tier 0 reads and completely safe:

```bash
cb help                      # command groups
cb help bot                  # every bot command with method, path and tier
cb bot get-bot               # list your bots
cb source get-source         # list your sources (each usually a GHL sub-account / client)
cb bot audit bot_XXXXXXXXXXXXXXXX   # one bot: red flags, template parity, KB posture
```

Add `--dry-run` to any generated command to see the exact request (key masked) without sending it.

---

## Step 7 (optional): Set your template bot and sandbox

**Template bot.** Pick the proven bot you want new client bots to match. Either:

```bash
export CB_TEMPLATE_BOT=bot_XXXXXXXXXXXXXXXX
# or write it to cb.config.json:
cli/cb init --template bot_XXXXXXXXXXXXXXXX            # folder mode: ./cb.config.json (gitignored)
cb init --global --template bot_XXXXXXXXXXXXXXXX       # plugin install: ~/.config/closebot/cb.config.json
```

**Sandbox.** Write-mode tests (`cb bot test`, `scripts/smoke.sh --write`) only run against a bot you've explicitly marked as a sandbox:

```bash
cli/cb init --sandbox            # folder mode: cli/sandbox.json (gitignored)
cb init --global --sandbox       # plugin install: ~/.config/closebot/sandbox.json
# then replace the placeholder ids, following the setup note in cli/sandbox.example.json
```

`cb` refuses to publish any sandbox id.

---

## Where to go next

| Goal | Read |
|---|---|
| Understand the rules every agent follows | [`CLAUDE.md`](./CLAUDE.md) |
| Know what's safe to call vs. what needs confirmation | [`docs/SAFETY.md`](./docs/SAFETY.md) |
| **Onboard your first client** | [`docs/CLIENT-MANAGEMENT.md`](./docs/CLIENT-MANAGEMENT.md) + [`docs/playbooks/12-onboard-new-client.md`](./docs/playbooks/12-onboard-new-client.md) |
| Update a client's FAQs / docs / scrapes | [`docs/playbooks/11-upload-kb.md`](./docs/playbooks/11-upload-kb.md) |
| Build a bot from scratch | [`docs/AGENT-BUILDING.md`](./docs/AGENT-BUILDING.md) |
| All numbered recipes | [`docs/playbooks/`](./docs/playbooks/) |
| Look up an endpoint | [`schema/endpoints.index.json`](./schema/endpoints.index.json), [`docs/endpoints/`](./docs/endpoints/), or CloseBot's [developer docs](https://developers.closebot.com) |
| Full CLI reference | [`cli/README.md`](./cli/README.md) |

---

## Using this with an AI agent

The point of this toolkit: put an AI coding assistant in front of it and let it do the clicking for you.

**Claude Code, plugin install**: the skills and the docs MCP load in every session, in any project. Say "map my CloseBot account" and Claude picks the `closebot-harness:closebot-map` skill. `CLAUDE.md` is not loaded in plugin mode; the `closebot-harness:closebot` skill carries the orientation, tier rules and routing table. The optional self-healing skill loop is off unless you set `CB_SELF_HEAL=1` (in your environment or `~/.config/closebot/.env`).

**Claude Code, folder mode** auto-loads `CLAUDE.md`, the skills (`skills/`, symlinked at `.claude/skills`), and the official CloseBot docs MCP server from `.mcp.json` when you open this folder. Just say "map my CloseBot account" or "duplicate my template bot for Acme Med Spa".

**Codex** reads `AGENTS.md` and discovers skills through `.agents/skills`. Add the docs MCP with the snippet in the [README](./README.md#closebot-developer-resources).

**Other agents** (Cursor, Aider, etc.) can be pointed at the same files:

- `AGENTS.md` / `CLAUDE.md`: orientation and rules (works as a system prompt)
- `schema/endpoints.index.json`: flat, machine-readable index of all 182 operations
- `schema/node-descriptors.json`: job-flow node descriptors
- `docs/playbooks/`: step-by-step recipes
- `https://developers.closebot.com/llms.txt` and the docs MCP at `https://developers.closebot.com/mcp`: CloseBot's live developer docs

If your agent proposes an endpoint that isn't in `schema/endpoints.index.json` or CloseBot's docs, it's hallucinating. Re-ground it on the index.

---

## Safety checklist before going live

1. Your `.env` (repo `.env`, gitignored; or `~/.config/closebot/.env` for a plugin install) is mode 600. `cb doctor` checks this.
2. Your API key is **only** in that `.env`: never hardcoded, never in commit history, never in an issue.
3. `cb doctor` passes.
4. You read [`docs/SAFETY.md`](./docs/SAFETY.md) and understand Tier 0 / 1 / 2.
5. You will not run a Tier 2 call (DELETE, publish, billing) without thinking twice.

Tier 2 calls move real money or change what your real customers see. The CLI requires `--confirm` for them and the agent rules forbid chaining them. That's on purpose.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `cb doctor` reports the key as invalid | Wrong key, revoked, or missing `cb_` prefix | Regenerate at [app.closebot.com/settings?tab=keys](https://app.closebot.com/settings?tab=keys) |
| `smoke.sh` reports spec drift | CloseBot's API changed since this copy was generated | `cb spec refresh` |
| `jq: command not found` | `jq` isn't installed | `brew install jq` or `apt install jq` |
| Endpoint returns 401 | Key is valid but can't access that resource | Some endpoints need an agency-level account |
| Endpoint returns 404 on a documented path | Spec drift, or your plan doesn't expose it | `cb spec refresh`, then check [developers.closebot.com](https://developers.closebot.com) |

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). `schema/openapi.json` is the source of truth; per-tag docs and the CLI spec regenerate from it via `cb spec refresh`.
