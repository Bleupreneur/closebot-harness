# Contributing

Thanks for helping improve closebot-harness. This is an unofficial, community-built project, not affiliated with CloseBot Inc.

## Ground rules

- **No client data in PRs.** No real `bot_`/`src_`/location ids, lead data, phone numbers, emails, client or business names, or local paths. Use placeholders like `bot_XXXXXXXXXXXXXXXX` and `src_XXXXXXXXXXXXXXXX`.
- **No keys, ever.** Not in code, tests, fixtures or PR descriptions. See [`SECURITY.md`](./SECURITY.md).
- **No copied CloseBot website or help-center text.** Link to [docs.closebot.com](https://docs.closebot.com) or [developers.closebot.com](https://developers.closebot.com) instead.
- **Zero dependencies.** The CLI runs on Node 22+ with no npm packages; keep it that way.
- **Every API call goes through `cli/cb`**, with the right risk tier (see [`docs/SAFETY.md`](./docs/SAFETY.md)).

## Run the tests

```bash
node --test 'cli/test/**/*.test.mjs'   # the quoted glob is required
```

PRs must pass with 0 failures. Live write tests only run if you have a `cli/sandbox.json`; without one they skip.

If you touch skills, endpoints, `cb` commands or the spec, also validate the evals:

```bash
node evals/check.mjs --validate   # every task's skill, endpoints and cb commands must still exist
```

See [`evals/README.md`](./evals/README.md) for how to run and grade the tasks.

## Spec refresh workflow

`schema/openapi.json` is the source of truth, fetched from CloseBot's public Swagger endpoint. Don't hand-edit it or the files generated from it (`schema/openapi.yaml`, `schema/endpoints.index.json`, `docs/endpoints/*.md`, `cli/closebot-cli.spec.*`).

When CloseBot's API changes:

```bash
cli/cb spec refresh --dry-run   # review added/removed/changed operations
cli/cb spec refresh             # write the spec and rebuild derived files
node --test 'cli/test/**/*.test.mjs'
```

`cb spec refresh` refuses removed operations unless you pass `--allow-removals`. If the spec gets something wrong (the API behaves differently from what it declares), fix it in `cli/overrides.json`, not in the generated files, and note it in `GOTCHAS.md`.

## Releases

- **Bump `version` in `.claude-plugin/plugin.json` on every release.** Installed plugin users only receive an update when that version changes; without a bump, they keep the old copy.
- Run the tests and `node evals/check.mjs --validate` before tagging.

## Contributing learnings from plugin mode

In a plugin install, gotchas and self-heal edits (`cb gotcha add`, the `CB_SELF_HEAL=1` hooks, skill-retro fixes) land in the plugin cache and are lost on the next update. If you learn something worth keeping, open a PR here with the `GOTCHAS.md` row and any skill or script fix. Use folder mode if you want local edits to persist.

Don't run the plugin install and folder mode in the same project: the self-healing hooks fire twice.

## Pull requests

1. Fork and branch off `main`.
2. Keep changes focused; update docs alongside behavior changes.
3. Run the tests and `git status` to make sure no `.env`, `cb.config.json`, `cli/sandbox.json` or `map/` output is staged.
4. Open the PR with a short description of what changed and why.

By contributing you agree your contribution is licensed under the MIT license in [`LICENSE`](./LICENSE).
