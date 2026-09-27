# Security

## Reporting a vulnerability

If you find a security issue in this toolkit (for example a way it could leak an API key, bypass a tier gate, or publish without confirmation), **do not open a public issue**. Report it privately through GitHub's [private vulnerability reporting](https://github.com/Bleupreneur/closebot-harness/security/advisories/new) for this repository.

Include what you found, how to reproduce it, and the impact. We'll acknowledge the report and work on a fix before any public disclosure.

Vulnerabilities in the CloseBot platform or API itself are not ours to fix. Report those to CloseBot Inc. directly. This project is unofficial and not affiliated with CloseBot.

## Never share your API key

- **Never paste an API key** (`X-CB-KEY`, `cb_...`) into an issue, pull request, discussion, log, screenshot or chat transcript. If you need to show a request, use `--dry-run`: the CLI masks the key as `***`.
- If a key is exposed, revoke it immediately at [app.closebot.com/settings?tab=keys](https://app.closebot.com/settings?tab=keys) and generate a new one.
- Also keep real bot/source ids, lead data and client names out of issues and PRs.

## Where keys live

- Your key goes in `.env` at the repo root, and nowhere else. `.env` is gitignored.
- Keep it owner-only: `chmod 600 .env`. `cli/cb doctor` flags looser permissions.
- Code reads the key from `$CLOSEBOT_API_KEY`; it is never hardcoded or written to tracked files.
- Other local-only files that may hold your ids or data are also gitignored: `cb.config.json`, `cli/sandbox.json`, `map/`.

## Tier model (summary)

Every CLI command is classified by risk. Full table: [`docs/SAFETY.md`](./docs/SAFETY.md).

| Tier | What | Gate |
|---|---|---|
| 0 | Reads (GET) | Run freely |
| 1 | Mutations (POST/PUT) | Agent states intent and shows the body first; `--dry-run` available |
| 2 | Destructive, publish, billing (DELETE, `POST /bot/{id}/publish`, refills) | CLI requires `--confirm`; agents need explicit user confirmation in the same turn and never chain Tier 2 calls |

Additional guards: publishing only goes through `cb bot publish <id> --confirm` (the raw generated publish command is refused), write-mode tests only run against ids in `cli/sandbox.json`, and `cb` refuses to publish a sandbox id.

## Supported versions

Only the latest `main` is supported. Run `cli/cb spec refresh` to stay in sync with CloseBot's live API.
