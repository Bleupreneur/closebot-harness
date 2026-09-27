---
name: closebot-publish-safely
description: Use when the user wants to publish a CloseBot draft live — phrases like "publish bot X", "ship the changes", "go live with [bot]", "make the draft live". This is the Tier 2 gate. Re-runs pre-flight validation, shows a diff vs. current live version, and REQUIRES explicit user confirmation in the same turn before calling POST /bot/{id}/publish. NEVER chains with other Tier 2 calls. Refuses to publish if invalidPaths is non-empty or sandbox test wasn't run.
tools: [cb bot version, cb bot publish, cb bot test]
---

# Skill: closebot-publish-safely

> Before changing anything, load the mental model: [`../../docs/HOW-CLOSEBOT-WORKS.md`](../../docs/HOW-CLOSEBOT-WORKS.md) (plugin install: `"$(cb root)/docs/HOW-CLOSEBOT-WORKS.md"`), especially §4, the safe change loop.

The mandatory Tier 2 gate for shipping a CloseBot draft live. Every other
skill that edits or builds a bot (`closebot-onboard-client`,
`closebot-build-job-flow`, `closebot-edit-job-flow`, `closebot-repurpose-bot`,
`closebot-apply-template`, `closebot-add-scenario`) delegates here — none of
them call `/publish` directly.

## When to use
- "publish [bot]" / "ship the changes" / "go live with [bot]"
- "make the draft live" / "ready to push"

## Do not use when
- The draft hasn't been sandbox-tested yet → run `cb bot test` first
- The bot is your sandbox bot (any id in `cli/sandbox.json`) — `cb`
  refuses this outright; it's the write-test sandbox and must never go live
- A duplicate hasn't had its persona/source re-attached (UI-only) or its
  offer content repurposed yet → `closebot-repurpose-bot` first

## Procedure
1. `cb bot version <id>` — highest version, whether it's a draft, and the
   current live version. Never hardcode a version.
2. `cb bot publish <id> --dry-run` — no `--confirm` needed for a preview
   (fixed 2026-09-05; see Gotchas). Every read (bot fetch, pre-flight, diff)
   runs for real; only the final POST is suppressed. Prints `{dryRun:true,
   target, live, diff}`. Nothing is sent to real customers by this call.
3. Show the diff and pre-flight result to the user. Confirm the two things
   `cb` can't see for you — a sandbox test was run, and on a duplicate the
   attached source is the CLIENT's, not the source bot's — see
   `references/publish-checklist.md`.
4. Wait for an explicit, same-turn "yes"/"PUBLISH" on the diff itself —
   never proceed on a bare "ok" or an approval from an earlier turn.
5. `cb bot publish <id> --confirm` (no `--dry-run` this time) — only after
   step 4. This is the call that actually ships it.
6. Verify: `cb bot version <id>` again — the live version now equals the
   target. Ignore any `message` field in the raw response; it carries the
   literal string `"null"` on success, not an error.
7. Tell the user: **treat the publish as able to affect live leads
   immediately.** Then check in `app.closebot.com` (UI-only) that the
   published version is assigned to the source's channels. Whether that UI
   assignment is also *required* before live conversations switch over is
   **unverified**, so do both and never assume the old version still shields
   real leads.

## What `cb` checks for you
- Refuses without `--confirm` on the REAL (non-dry-run) publish (exit 4).
  `--dry-run` alone is enough to preview — it never sends the POST either way
  (fixed 2026-09-05, GOTCHAS.md)
- Refuses any id listed in `cli/sandbox.json` — checked FIRST, before the
  confirm gate, so this fires even under `--dry-run` (exit 4)
- Refuses if the highest version is already live — "nothing to publish" (exit 2)
- Pre-flight: `cb bot audit --json` must parse,
  `framework_parity.on_framework === true`, AND every `red_flags[]` entry
  with `severity:"FAIL"` fails the publish (exit 2, flags listed) — a
  `MISSING_CALENDAR`, `ORPHAN_NODE`, `FRAMEWORK_GAP` or `NO_PERSONA` entry
  blocks it; `WARN` entries (KB posture, drift, title collisions, inline
  calendar leaks) are shown but do not block (fixed 2026-09-05, GOTCHAS.md —
  `red_flags[]` is now emitted by `cb-view-agent.sh --json`)
- Prints the node diff vs. live before anything is sent
- After the POST, verifies via `GET /bot/{id}` `versions[].published` —
  never trusts the response body's `message` field
- The generated `bot post-publish` alias is refused outright (exit 4); there
  is no bypass

## Tier
2 — `--confirm` required for the real publish, never chained with another
Tier 2 call in the same turn. `cb bot test` (sandbox) is expected before
this and itself refuses `--dry-run` — there's no meaningful dry run of a
real ephemeral session.

## Gotchas that shaped this skill
- Publish success shape is `{"version":"...","message":"null"}` — a literal
  string, not JSON null; never key success off `message` (GOTCHAS.md 2026-06-24).
- `GET /bot/{id}/testSession/messages/{leadId}` is a long-poll — `cb bot
  test` bounds it internally; never call it with a raw, unbounded request
  (GOTCHAS.md 2026-06-22).
- A UI autosave can fork/clobber a draft mid-session — always re-derive the
  target version rather than trusting one captured earlier in the turn
  (GOTCHAS.md 2026-06-19).
- A duplicated bot inherits an unusable persona AND the SOURCE bot's GHL
  source — both UI-only gates, both invisible to `cb`'s pre-flight
  (GOTCHAS.md 2026-06-22).
- No bot name is a safe write-test signal — sandbox membership is enforced
  by `cli/sandbox.json`, never inferred (GOTCHAS.md 2026-09-04).
- `cb bot publish --dry-run` used to require `--confirm` too, because the
  code checked `--confirm` unconditionally before it ever looked at
  `--dry-run` — a preview-only caller had to pass both flags. **FIXED
  2026-09-05 in `cli/lib/bot.mjs`**: the sandbox-id refusal now runs first
  (still fires under `--dry-run`), and `--confirm` is required only on the
  real publish path (GOTCHAS.md 2026-09-05).

## References
- `references/publish-checklist.md` — full precondition table, the
  duplicate persona/source risk in detail, and the common-failure-mode table.
