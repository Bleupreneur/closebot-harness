# Publish checklist — full detail

## Hard preconditions (refuse to proceed without)

| Check | If it fails |
|---|---|
| `$CLOSEBOT_API_KEY` is set | Run `scripts/smoke.sh` first |
| `BOT_ID` is real | `cb bot version <id>` must resolve — a 404 means wrong id |
| Latest draft has `invalidPaths: []` | Already enforced by `cb bot push` at edit time (exits 3 on non-empty); if you didn't edit through `cb bot push` for this draft, re-save it that way before publishing |
| Bot has a source attached | `cb bot audit <id> --json \| jq .sources` — empty means publishing succeeds but no real conversation routes to it until a source is attached + version assigned in the UI |
| **(Duplicates) the attached source is the RIGHT client** | A duplicate inherits the SOURCE bot's GHL source; publishing then makes `{{location.*}}` and live routing resolve to the WRONG client. Compare via `bash scripts/ghl-business-facts.sh <BOT_ID>` — if it resolves to the source bot's location, **refuse to publish**. Re-attaching a source is OAuth-flow-only (UI), not API-callable |
| **A persona is assigned** | A fresh duplicate inherits an unusable persona reference → sandbox returns `mostRecentFailureReason: "no_persona"` and the bot won't reply at all. Assignment is UI-only ([[closebot-persona-no-api-assign]]). Without it, the sandbox-test precondition below is unreachable |
| User has confirmed in this turn | Block until they type an unambiguous yes/PUBLISH |
| At least one sandbox test was run | Strongly recommend; allow override with explicit "I tested manually." A duplicate cannot be sandbox-tested until its persona is assigned (above) |

## Why the duplicate-source check is the highest-risk silent failure

A bot duplicated from another bot stays attached to the SOURCE bot's GHL
source until someone re-attaches it in the UI. Publish itself has no way to
know this — `cb bot publish`'s pre-flight only checks framework parity, not
which client a source belongs to. If you publish before re-attaching, real
leads on the client's channel get merge fields (`{{location.name}}`, etc.)
and routing that resolve to the WRONG client's GHL sub-account. Always run
`bash scripts/ghl-business-facts.sh <BOT_ID>` and compare the resolved
location against the intended client before publishing anything that came
from `closebot-repurpose-bot` or `closebot-onboard-client`.

## What this skill refuses to do

| Request | Why refused |
|---|---|
| Publish multiple bots in a loop | Each publish is its own Tier 2 — confirm individually (see `closebot-bulk-fanout`'s "list and stop" pattern) |
| Publish without showing the diff first | The diff is the user's last chance to catch a mistake |
| Publish when `invalidPaths` is non-empty | Server might accept it, but partial state could break things — refuse outright |
| Publish + immediately delete the previous version | Two Tier 2 calls in one turn — do them separately |
| Publish when the user just said "yes" without an unambiguous confirmation | Lazy confirmation patterns cause real production incidents |

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `cb bot publish` exits 2, "pre-flight: FRAMEWORK GAP" | `framework_parity.on_framework` is `false` | Splice via `closebot-apply-template`, re-audit, retry |
| `cb bot publish` exits 4, sandbox id | Target is in `cli/sandbox.json` — refused even under `--dry-run` | Never publish the sandbox bot — pick the real bot id |
| `cb bot publish --dry-run` exits 2, "nothing to publish" | Highest version is already live | Nothing to do — confirm you meant to publish a NEW draft. (Before 2026-09-05, `--dry-run` alone exited 4 here because `--confirm` was wrongly required for a preview too — fixed in `cli/lib/bot.mjs`.) |
| Publish 404 | Wrong bot id, or bot was deleted | Verify with `cb bot version <id>` |
| Publish 401 | Key revoked or scope changed | Regenerate at `app.closebot.com/settings?tab=keys` |
| Response shows `"message":"null"` | Not an error — the literal success shape | Ignore `message`; confirm via `versions[].published` |
| Publish succeeds but live conversations seem unchanged | Possibly the new version isn't assigned to channels yet (UI step). Whether that assignment is required is **unverified**; always assume a publish can reach live leads immediately | Check UI → Versions → channel assignment; confirm `versions[].published`; retest in a test session |
| Sandbox test never returns / bot won't reply | `no_persona` — duplicate inherited an unusable persona reference | Assign a persona in the UI (UI-only); re-check `GET /bot/{id}/testSession` |
| Live conversations greet the wrong client after publish | Duplicate still attached to the SOURCE bot's GHL source | Re-attach the correct source in the UI (OAuth-only) BEFORE publishing |
