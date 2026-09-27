# cb — CloseBot CLI

Zero-dependency Node 22 CLI (`cli/cb`) over the CloseBot REST + Live Message API.
Wraps every generated operation from `closebot-cli.spec.json` (every REST op in the spec) plus
composite commands (`bot`, `kb`, `spec`, `gotcha`) that chain multiple calls with
version resolution, diffing, and verification built in. This is the sanctioned way
to drive the API — see the repo root `CLAUDE.md` / `AGENTS.md` for the interface
preference (CLI-first, not raw curl, not MCP).

For the declarative spec itself and how it's generated/compiled, see
[`CODEGEN.md`](./CODEGEN.md), [`closebot-cli.spec.yaml`](./closebot-cli.spec.yaml)
(human-readable) and [`closebot-cli.spec.json`](./closebot-cli.spec.json) (what `cb`
actually loads).

## Install

```bash
chmod +x cli/cb
ln -sf "$PWD/cli/cb" ~/.local/bin/cb   # optional, puts `cb` on PATH
```

## Auth

Key resolution order: `CLOSEBOT_API_KEY` env var → `<repo>/.env` → `~/.config/closebot/.env`
(`$CLOSEBOT_CONFIG_DIR/.env` if set). Nothing else is read; a project's own `./.env` never is.
The same user-level dir holds `cb.config.json` and `sandbox.json` for plugin installs, where
the repo copy is Claude Code's plugin cache and is replaced on every update.

**Folder mode vs plugin install.** In a clone, run `cli/cb`. As a Claude Code plugin, `bin/cb`
is on the Bash tool's PATH, so it's plain `cb`. Plugin mode is detected from the install path
(`~/.claude/plugins/cache|marketplaces/...`), `CLAUDE_PLUGIN_ROOT`, or `CB_PLUGIN_MODE=1`; in
it `cb init` writes to the user-level dir and `cb map` writes under the current directory.
`cb root` prints the harness root (where `scripts/` lives).
Generate a key at `https://app.closebot.com/settings?tab=keys` (shown once). There is
no `--key` flag, and the generated spec's `global_flags` no longer lists one — it was
removed because 8 `livedemo` commands take `key` as a **path** parameter
(`GET /bot-live-demo/live/{key}`, …), and a caller who trusted the documented flag would
have interpolated the API key straight into the request URL. Set the env var or `.env`
file instead. In `--dry-run` output the key is always masked as `***`.

## First run: init, doctor, map

```bash
cli/cb init                         # creates .env (mode 600) from .env.example; paste your key into it
cli/cb doctor                       # checks setup; fix any [fail] line, then re-run
cli/cb map                          # writes map/<agency-slug>-<YYYY-MM-DD>/
```

All three are Tier 0. `init` and `doctor` run without an API key; every command takes
`--help` (`cb map --help`, or `cb help map`).

| Command | What it does |
|---|---|
| `cb init [--global] [--sandbox] [--template <bot_id>] [--json]` | No network. Creates `.env` from `.env.example` and sets mode 600. `--sandbox` also creates `cli/sandbox.json` from `cli/sandbox.example.json`; `--template <bot_id>` also creates `cb.config.json` with `templateBot`. `--global` (the default in a plugin install) writes all three into `~/.config/closebot/` (dir mode 700) instead of the repo. Never overwrites an existing file (it reports `[kept]`), never reads or prints the key |
| `cb doctor [--json] [--offline]` | Prints `[ok]` / `[warn]` / `[fail]` per check: Node >= 22; mode (folder or plugin install) and config dirs; every `.env` it reads present and mode 600 (a missing `.env` is only a warning when `CLOSEBOT_API_KEY` is set in the environment); key present (source and length only, never the value); key valid via `GET /agency/current` and the agency name; local `schema/openapi.json` op count vs CloseBot's live Swagger (a network failure, or `--offline`, is a warning; drift is a warning that points at `cb spec refresh --dry-run`); `cli/sandbox.json` present and not placeholder; template bot configured and found (`GET /bot/{id}`). Exits 2 if any check is `[fail]`, else 0. `--json` prints `{ok, checks:[{status,name,detail}]}` |
| `cb map [--bot <id>] [--no-steps] [--metrics] [--json] [--out <dir>] [--concurrency 4]` | Read-only inventory of the whole account (GET only; the op list is in the header of `cli/lib/map.mjs`). Agency and agencies; sources with category, connected, topicsEnabled, channels and attached bots; bots with versions (live vs edit target), sources, personas, enabled tools, and, from the edit target's job flow, node count, node-type histogram, orphan nodes and framework parity; personas; library-file and Smart FAQ counts per source; dashboards and reports; with `--metrics`, `GET /botMetric/agencySummary` plus 30-day message counts per source and action counts per bot. Up to 4 reads run at once. A failed read is recorded in `errors` and the map continues; it exits 3 only if every read failed |

`cb map` writes three files to `map/<agency-slug>-<YYYY-MM-DD>/` (or `--out <dir>`);
`--json` prints `map.json` to stdout and writes nothing.

- `map.json`: the full structure, including `issues`, `errors` and `opsUsed`.
- `MAP.md`: summary, sources, bots, personas, dashboards/reports, metrics, template,
  flagged issues, a section per bot, errors, and next steps.
- `map.mmd`: a mermaid diagram of agency → sources → bots, with KB counts per source.

Flagged issues: `FAIL` `NO_PERSONA`, `ORPHAN_NODE`; `WARN` `NEVER_PUBLISHED`, `NO_KB`,
`FRAMEWORK_GAP`, `LIBRARY_OFF`, `KB_NOT_READY`, `SOURCE_DISCONNECTED`,
`TEMPLATE_NOT_FOUND`; `INFO` `DRAFT_NEWER_THAN_LIVE`, `NODE_TYPE_GAP` (node types the
template bot has and this bot lacks, only when a template bot is configured),
`NO_SOURCE`, `SOURCE_NO_BOT`.

The map fetches no lead data. It keeps only safe fields: no agency member names or
emails, no `modifiedBy`, no source keys or access tokens, no Smart FAQ text or lead ids.
The result is also passed through `redactFields`. `map/` still contains your own ids
and names, so don't commit it. The `closebot-map` skill runs `doctor` and `map`, then
summarizes `MAP.md` into next actions.

The template bot comes from `CB_TEMPLATE_BOT` (environment, then `.env`), then
`cb.config.json` → `templateBot`, the same order `scripts/cb-view-agent.sh` uses. The
shipped placeholder `bot_XXXXXXXXXXXXXXXX` counts as unset.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | OK |
| 2 | Validation refused (bad args, missing key, nothing-to-do, malformed `--body` JSON, a missing/unreadable local file such as `steps.json`/`overrides.json`/the CLI spec) |
| 3 | API error (non-2xx the CLI doesn't treat as expected, or a post-write verification failed) |
| 4 | Tier gate refused (Tier 2 op without `--confirm`), or a generated command that a composite owns (e.g. `bot post-publish`, `bot post-save`) |

## Tiers

Every `DELETE`, `POST /bot/{id}/publish`, and the two billing-refill endpoints are
Tier 2 (`cli/overrides.json` → `tier2`) and require `--confirm` on the same
invocation — there is no env var or config bypass. The one exemption is
`DELETE /bot/{botId}/testSession/{leadId}` (`overrides.json` → `tier2Exempt`),
downgraded to Tier 1 so `cb bot test`'s cleanup can run without `--confirm`.
Everything else defaults: `GET` = Tier 0, everything not listed = Tier 1.

## Global flags

| Flag | Effect |
|---|---|
| `--json` | Print raw JSON instead of the default table for list-shaped responses |
| `--dry-run` | For a generated command: print the resolved method/URL/headers/body (key masked) and exit without sending. For `bot publish`: every read (bot fetch, pre-flight, diff) runs for real — only the final `POST /bot/{id}/publish` is suppressed — so the printed diff reflects reality, not a descriptor; `--confirm` is NOT required alongside `--dry-run` (the sandbox-id refusal still fires first, before either check). For `bot push`: prints the save request descriptor and exits 0 without saving, without re-pulling, and without the `savedVersion`/`landed` check — there is nothing to verify a landing against when nothing was sent. `bot test` refuses `--dry-run` outright (there's no meaningful dry run of a real ephemeral test session) |
| `--confirm` | Required to run a Tier 2 operation. Exception: `bot publish --dry-run` does not require it — dry-run never sends the POST regardless |
| `--unsafe-raw` | Warns on stderr, then skips redaction/projection — prints raw token fields and raw source rows that are otherwise masked or trimmed |

## Composite commands

| Command | What it does |
|---|---|
| `cb bot version <id>` | Resolves the edit target: highest semver across all versions, whether it's published, and the current live version |
| `cb bot pull <id> [--version v] [--out file]` | Pulls a version's job flow (defaults to the resolved target) |
| `cb bot push <id> steps.json` | Saves, re-pulls the version the save landed on, and verifies it matches what was sent; exits 3 on a non-empty `invalidPaths`, on a UI-autosave clobber, or if the re-pull itself fails. `--dry-run` prints the save request descriptor (`{dryRun:true, method, url, nodes}`) and exits 0 — sends nothing, and skips the re-pull/`landed` check entirely since there's nothing to verify |
| `cb bot publish <id> --confirm [--dry-run]` | Tier 2. Refuses sandbox ids (`cli/sandbox.json`, gitignored, copied from `sandbox.example.json`; or `$CB_SANDBOX_FILE`) first — even under `--dry-run` — then refuses if nothing changed, runs `cb-view-agent.sh --json` pre-flight, shows a node diff vs. live, then publishes and verifies `GET /bot/{id}` shows the version as published. `--confirm` is only enforced on this real path; `--dry-run` alone is sufficient to preview. The pre-flight enforces `framework_parity.on_framework === true` AND that `red_flags[]` contains no `severity:"FAIL"` entry (`MISSING_CALENDAR`, `ORPHAN_NODE`, `FRAMEWORK_GAP`, `NO_PERSONA`) — `cb-view-agent.sh --json` emits `red_flags` built from the same §12 scan as the human report (fixed 2026-09-05; see the 2026-09-04 row in `GOTCHAS.md`). `WARN`-severity flags (KB posture, drift, title collisions, inline calendar leaks) are informational and do not block. `--dry-run` runs every read for real (the bot fetch, the pre-flight, the diff) and prints `{dryRun:true, target, live, diff}` — only the final `POST /bot/{id}/publish` is suppressed, so the printed diff is trustworthy, not a guess |
| `cb bot test <id> "message" [--max-time 30] [--lead <leadId>]` | Opens a sandbox test session, sends one message, polls for the reply, and deletes the ephemeral test lead in a `finally` block so a failure still cleans up — a Ctrl-C mid-call can still leak the test lead. With `--lead <leadId>` it reuses a session you created with `cb bottesting post-testsession --botId <id> --body '{}'` and never creates or deletes one — that is how a multi-turn probe keeps conversation memory across turns (`closebot-quality-audit/references/scripts/multi-offer-probe.sh`); delete it yourself with `cb bottesting delete-testsession --botId <id> --leadId <leadId>`. Refuses `--dry-run` outright (exit 2): there's no meaningful dry run of a real ephemeral test session |
| `cb bot audit <id> [--json]` | Shells out to `scripts/cb-view-agent.sh` |
| `cb kb build --source <src> --from <dir> [--faq-csv f] [--url u]` | Uploads every new/changed file in `dir`, runs a `--url` webscrape, loads an optional FAQ CSV (double-quoted fields with embedded commas are parsed correctly, not naively split on every comma), attaches everything to `sourceId`, and ends by calling `kb verify`. Tracks state in `<dir>/.cb-kb-manifest.json`, recording each upload as `attached:false` before the attach call and flipping it to `true` only once attach succeeds — if attach fails, the CLI exits 3 naming the orphaned `fileId` (the file exists in the library, just unattached) and **never deletes it**. `--url` is single-value — a repeated `--url` keeps only the last one, so one scrape per invocation |
| `cb kb update --from <dir>` | Diffs `dir` against the manifest: replaces changed files in place (multipart `newFile`), uploads+attaches new ones (same `attached:false`→`true` orphan tracking as `build`), detaches removed ones. Never issues a `DELETE` |
| `cb kb verify --source <src> [--bot <id>] [--from <dir>]` | Lists attached files and flags any not ready — `fileStatus` has no documented enum (`schema/openapi.json`'s `FileDto.fileStatus` is a nullable string), and live observation shows real, working, attached files report `"indexed"`, not `"ready"`; both count as ready, anything else (`"processing"`, `"failed"`, empty/null) does not. With `--bot`, also flags Method nodes missing `EnableLibraryContext`; with `--from`, surfaces any manifest entries still `attached:false` from a previous partial `build`/`update` |
| `cb spec refresh [--source upstream\|mcp] [--allow-removals] [--dry-run]` | Refetches the upstream Swagger spec and diffs it against `schema/openapi.json`. `--dry-run` prints the diff plus a `wouldRefuse` flag and writes nothing. Otherwise: refuses on any removed operation unless `--allow-removals`, writes the upstream bytes verbatim, runs `scripts/build.py` (restoring the old spec if that fails), refreshes `schema/node-descriptors.json`, warns on now-stale `overrides.json` entries, and prepends a changelog block. `--source mcp` is an untested fallback path |
| `cb gotcha add --skill s --symptom s --cause c --fix f` | Inserts a newest-first row under the gotcha table header (root `GOTCHAS.md` if present, else `.claude/skills/GOTCHAS.md`) |
| `cb gotcha review [--json] [--mark 0,2]` | Lists unreviewed entries from `gotchas/auto.jsonl` (auto-logged whenever a call gets an unexpected status or a 400 shape-mismatch); `--mark` flips entries to reviewed. Works without an API key |

Every other generated command follows `cb <group> <cmd> [--flag value] [--body '<json>']`
— run `cb help` for the group list or `cb help <group>` for one group's commands, tier,
and method/path. `cb help <group>` lists composite commands (method column: `composite`)
ahead of generated ones, so `cb help bot` shows both `bot publish` and the generated
`bot post-publish` alias it disables. The `bot` group has two hand-picked aliases:
`cb bot list` → `get-bot`, `cb bot delete` → `delete-bot`.

Two generated commands are permanently refused (exit 4) because a composite already
owns that operation end-to-end and the generated path skips every safety check the
composite provides: `bot post-publish` (`POST /bot/{id}/publish` — use `cb bot publish`)
and `bot post-save` (`POST /bot/{id}/save` — use `cb bot push`). This applies regardless
of `--confirm` or `--dry-run`.

## `overrides.json`

Drift/behavior corrections the generated spec can't express on its own:

| Key | Purpose |
|---|---|
| `tier2` / `tier2Exempt` | Tier overrides described above |
| `redactFields` | Field names masked as `***` everywhere except `--unsafe-raw` |
| `projectSources` | Fields kept when a source-listing response is projected down (also skipped under `--unsafe-raw`) |
| `liveMessageStatuses` | Maps the Live Message endpoint's non-standard codes (410/420/430/440/450/460) to an `ok:true` + explanatory `note` |
| `operations` | Per-`METHOD path` fixes: `requiredQuery` (spec says optional, API 400s without it), `bodyShape: "array"` (spec says object, API wants a bare array), `expect: <status>` (a single documented success status that isn't the default 2xx JSON shape, e.g. `POST /smart-faq` → 204), `expectedStatus: {"<status>": "note"}` (a status that's `ok` only with an explanatory note attached), `followUp` (chain a GET after a 204/no-id response to recover the created record), `clientFilter` (server ignores a filter param; filter client-side — if the response isn't an array, the CLI does NOT filter silently: it returns the raw data with a `note` warning the results are unfiltered, rather than risk e.g. `kb verify` counting every file in the account as attached), `project`/`envelope` (apply `projectSources` to this op's response) |

To add an override: find the exact `METHOD /path` key (from `cli/closebot-cli.spec.json`
or a live 400/404), add it under `operations`, and add a regression case in
`cli/test/http.test.mjs`. `cb spec refresh` warns if an override's key disappears
from a newly-fetched spec.

## Gotchas log

`gotchas/auto.jsonl` is tracked in git and appended to automatically by every CLI call
that hits an unexpected status or a 400 that looks like a body-shape mismatch. Review
with `cb gotcha review`, then either fix the root cause or promote it with
`cb gotcha add` so it lands in the human-readable gotchas table.

## Testing

```bash
node --test 'cli/test/**/*.test.mjs'   # unit tests — plain `cli/test/` breaks module
                                        # resolution on Node 22, always use the glob
bash scripts/smoke.sh --write          # live sandbox round trip (only the ids in
                                        # cli/sandbox.json, never published by cb) plus the read-only checks
```

### Sandbox setup (required for any write-mode test)

Write-mode tests only ever touch ids listed in `cli/sandbox.json` (gitignored, per
account). To create it:

1. In the CloseBot UI, duplicate your template bot and name it `[CB-SANDBOX] ...`. Never
   publish it.
2. Attach it to a test webhook source that routes to no real client (source creation is
   OAuth-only, so do this in the UI).
3. `cp cli/sandbox.example.json cli/sandbox.json` and put the bot id in `bots`, the
   source id in `sources` / `sourceId`.

`CB_SANDBOX_FILE=/path/to/other.json` points `cb` at a different allowlist. With no file,
no id counts as a sandbox, so write-mode tests have nothing they are allowed to touch.

`kb build`/`kb update` write paths run live against `sourceId` using the generic files
in `cli/sandbox-kb/`; the manifest (`cli/sandbox-kb/.cb-kb-manifest.json`) is created
on the first `cb kb build`. Without a sandbox source the kb write test is skipped.
