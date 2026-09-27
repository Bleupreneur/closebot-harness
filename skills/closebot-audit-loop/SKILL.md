---
name: closebot-audit-loop
description: Use when the user wants to run an autonomous audit→tweak→re-audit LOOP on one CloseBot bot or the whole fleet — phrases like "run the audit loop on [bot]", "audit and auto-fix", "loop until it's perfect", "perfect [client]'s bot", "keep auditing and tweaking", "run audits on all agents and fix what you find". Drives scripts/cb-audit-loop.sh (mechanical whitelist fixes, draft-only) plus an agent judgment loop for content/structural findings, iterating until the audit is clean or every remaining item is human-gated. NEVER publishes — publish stays with closebot-publish-safely + explicit human confirmation.
tools: [cb bot audit, cb bot version, cb bot pull, cb bot push, scripts/cb-audit-loop.sh]
---

# CloseBot Audit Loop — audit → tweak → re-audit until clean

Two layers, one loop:

| Layer | Who | Fixes | Guarantee |
|---|---|---|---|
| **Mechanical** | `scripts/cb-audit-loop.sh --auto` | Whitelisted, content-free flag flips (W1 EnableLibraryContext, W2 EnableSmartFaq) | Deterministic, save-verified, draft-only |
| **Judgment** | You (this skill) | agent_queue items: contradictions, leaks, framework gaps, calendars, Job Info | One finding per iteration, re-audit after every save |

**Terminal states per finding:** `fixed` (re-audit no longer reports it) · `ask` (needs a fact only the human/GHL has) · `ui-gated` (persona/source — CloseBot UI only) · `wont-fix` (false positive — record WHY in GOTCHAS).
**The loop is done when every finding is in a terminal state. "Clean" = exit 0.**

## When to use
- "run the audit loop on [bot]" / "audit and auto-fix" / "loop until it's perfect"
- "perfect [client]'s bot" / "keep auditing and tweaking"
- "run audits on all agents and fix what you find" (fleet mode, `--fleet`)

## Do not use when
- A one-shot read with no auto-fixing → `closebot-view-agent`
- Grading real conversations against a rubric → `closebot-quality-audit`
- The draft is already clean and ready to ship → `closebot-publish-safely`
  (this loop never publishes)

## Procedure

### 0. Smoke + scope
`bash scripts/smoke.sh` must be green. Confirm target: one bot id, or `--fleet`.
Read `$CLOSEBOT_DIR/GOTCHAS.md` first — known false-positive classes live there.

### 1. Mechanical pass
```bash
bash scripts/cb-audit-loop.sh <bot_id> [--auto] [--max-iter N] [--json]
bash scripts/cb-audit-loop.sh --fleet [--auto] [--max-iter N]
```
`--auto` applies whitelisted mechanical fixes to the latest UNPUBLISHED draft and
re-audits, looping until none remain or `--max-iter` (default 5) is hit. `--json`
emits one machine-readable report object on stdout. `--fleet` runs against every
bot from `GET /bot`. The script verifies every save by re-pull and edits the NEWEST
version by semver (never a stale abandoned draft). Exit 0 = fully clean; exit 1 =
agent_queue / ui_gated items remain.

### 2. Judgment loop — one finding at a time
For each `agent_queue[]` item, in this order (structural before content — a splice
rewrites content anyway):

| type | Recipe | Rules |
|---|---|---|
| `framework_gap` | **closebot-apply-template** (ref: your template bot, `$CB_TEMPLATE_BOT`) | Full skill, not a shortcut. Keep client identity/calendar. |
| `orphan_node` | closebot-edit-job-flow | Wire inbound edge if the node is wanted; else delete + splice bypass edge. |
| `title_collision` | closebot-edit-job-flow | Retitle the NON-template duplicate only. By-design template dupes (Booking Agent ×2, Transfer Message ×4, paired scenarios) are already filtered out by the script. |
| `missing_calendar` | **ASK** unless the correct id is already verified this session (GHL lookup via `scripts/ghl-business-facts.sh` or user statement). Never guess a calendar id. |
| `empty_job_information` | closebot-repurpose-bot Step (GHL facts → variables.business) | Verify facts against live ads first (the running ads define the real offer). |
| `content_warning` (contradiction/leak) | closebot-edit-job-flow | **Verify the true fact BEFORE editing** (live ad / GHL / KB — never trust the bot's own copy). If the warning is a scanner false positive: mark `wont-fix`, improve the scan in cb-view-agent.sh, log to GOTCHAS. |

After EVERY save: confirm `invalidPaths:[]`, re-pull the returned version, assert your
change landed (UI-autosave clobber detection), then **re-run step 1**. The re-audit is
the only proof a finding is fixed — never mark from memory.

### 3. Stop conditions (hard)
- **Clean** — exit 0 from the script and empty agent_queue → report + stop.
- **Iteration cap** — 5 judgment iterations per bot per session. Hitting it = something
  is oscillating; stop and report, don't churn.
- **Same finding twice after a "fix"** — your fix didn't take or the scanner is wrong.
  STOP on that finding, diagnose (systematic-debugging), don't re-apply blindly.
- **Any `ask` item** — batch questions and surface them once at the end, not mid-loop.

### 4. What this loop NEVER does
- **Never `cb bot publish`** — end state is a verified clean DRAFT. Publishing
  is a separate human decision through closebot-publish-safely (Tier 2, same-turn
  `--confirm`).
- Never Tier 2 of any kind (DELETE, billing, saveTools wholesale).
- Never edits persona linkage or source attachment (UI/OAuth gates — report them).
- Never invents facts (calendars, prices, provider names, hours) to clear a warning.

### 5. Report
End with, per bot: iterations run · mechanical fixes applied · judgment fixes applied
(what + which draft version) · `ask` items (batched questions) · ui-gated items ·
final clean/flags state · explicit "draft NOT published" line.

## Fleet mode
`--fleet` audits every bot on the account. Work bots worst-first (largest agent_queue).
For LIVE bots, remember: you're perfecting the DRAFT; the live version doesn't change
until a human publishes. Note draft_vs_live_drift in the report so nobody assumes
live is fixed.

## Two-session mode (optional: separate auditor and builder)
If you split QA and building across two sessions or people:
- The **Auditor** runs the script READ-ONLY (`cb-audit-loop.sh <bot> --json`,
  no `--auto`) and files one ticket per bot (in whatever tracker you use) with
  the findings JSON attached.
- The **Builder** (you) runs this skill against the ticket, posts the loop
  report back on the ticket, and marks the draft ready for review.
- Conversation-level QA (sandbox test sessions) stays with the Auditor — remember
  `GET /bot/{id}/testSession/messages/{leadId}` is a long-poll (`--max-time`!) and
  duplicates need a persona (UI) before the sandbox replies at all.

## Tier
0/1 — mechanical and judgment fixes both mutate the DRAFT only (Tier 1,
save-verified by re-pull). Never Tier 2: no publish, no DELETE, no billing.
Publish is a separate human decision via `cb bot publish --confirm` through
`closebot-publish-safely`, never chained here.

## Gotchas that shaped this skill
- Version targeting = newest semver, NOT "last unpublished" (stale-draft resurrection
  trap, caught live on a client bot: draft 0.0.4 vs live 0.0.13, 2026-07-02).
- Template title duplicates (by design) are not collisions.
- Provider-contradiction scanner had a verb-capture false-positive class ("confirms
  tox") — fixed 2026-07-02; if a new false-positive class appears, fix the scanner,
  don't just skip the finding.

## References
- `scripts/cb-audit-loop.sh` — the loop engine (mechanical pass, `agent_queue`
  shape, exit codes)
- `$CLOSEBOT_DIR/GOTCHAS.md` — known false-positive classes and past fixes
  to the scan itself
