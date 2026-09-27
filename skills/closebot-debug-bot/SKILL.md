---
name: closebot-debug-bot
description: Use when a CloseBot bot is misbehaving — phrases like "bot isn't using the FAQs", "bot booked the wrong calendar", "bot keeps saying [old brand name]", "leads complain that the bot [issue]", "why is bot X doing Y". Systematic troubleshooting: pulls bot config, checks KB attachment, audits tool flags, scans prompt text for stale references, inspects recent leads, reproduces in the sandbox.
tools: [cb bot audit, cb kb verify, cb bot pull, cb bot push, cb lead get-lead-2, cb lead get-lead, cb lead get-ai-toggle, cb bot test, cb billing get-balance, cb notification get-notifications]
---

# Skill: closebot-debug-bot

Systematic troubleshooting for a misbehaving CloseBot bot. Don't guess — diagnose.

## When to use
- "bot isn't using the FAQs/KB", "bot booked the wrong calendar"
- "leads complain the bot says X", "the bot keeps saying [old client/brand]"
- "why is bot X doing Y", "the bot stopped working"

This skill is **symptom-driven** — a *reported failure* that needs live-data
inspection and sandbox reproduction.

## Do not use when
- Nothing is reported broken and you just want to understand/audit a bot's
  config → `closebot-view-agent` (faster, config-driven, automated red-flag scan)
- The bot was duplicated and still has the source bot's data → `closebot-repurpose-bot`
- You already know the fix and just need to apply it → `closebot-edit-job-flow`

## Diagnostic order (run sequentially, stop once you have a hypothesis)

1. **Bot state** — `cb bot audit <BOT_ID> --json | jq '{sources, live_version, draft_version, persona: .persona.attached}'`.
   `sources: []` → nothing routes to this bot, explains "doesn't respond at
   all". `live_version != draft_version` → the user's "fix" may not be live
   yet. `persona: false` → the bot can't reply at all (`no_persona`).

2. **Knowledge attachment** — `cb kb verify --source <SOURCE_ID> --bot <BOT_ID>`.
   Reports `attached` count, `notReady` files, and
   `methodsThatCannotReadLibrary`. Zero attached + user says "ignores my
   upload" → run `closebot-attach-knowledge`.

3. **KB tool flags** — `cb bot audit <BOT_ID> --json | jq '.method_nodes[] | {title, EnableSmartFaq: .flags.EnableSmartFaq, EnableLibraryContext: .flags.EnableLibraryContext}'`.
   **Smart FAQ and library files are SEPARATE retrieval paths** —
   `EnableSmartFaq=true` does NOT cover library files. The common live
   failure (bot_XXXXXXXXXXXXXXXX, 2026-06-24): FAQs work so the bot *looks*
   KB-connected, yet `EnableLibraryContext=false` makes it blind to every
   attached library file (e.g. pricing that lives only in a `.md`). Also
   check `cb bot audit <BOT_ID> --json | jq '.account_tools'` for the
   account-level Smart FAQ tool.

4. **Calendar** — `cb bot audit <BOT_ID> --json | jq '.method_nodes[] | {title, cal: .calendar, sections}'`
   — read the Section bodies for a hardcoded old calendar id (the smoking
   gun for "books wrong calendar"). Fix recipe: `references/diagnostic-recipes.md`.

5. **Stale brand / leftover client name** — grep the same `sections`/
   `instructions` text for the wrong name the user reported. Fix recipe in
   `references/diagnostic-recipes.md`.

6. **Booking tool flags** — from the same `method_nodes[].flags`:
   `EnableGhlBooking: true` with no `GhlBookingCalendarId` → tries to book
   with no calendar (also an `invalidPaths` risk on push).
   `EnableCheckAvailability: false` with `EnableGhlBooking: true` → books
   blind, often fails to find a slot.

7. **Scenario nodes** — `cb bot audit <BOT_ID> --json | jq '.scenario_nodes'`.
   A `ScenarioGoodbye`/`not_interested` with a too-loose trigger ends
   conversations prematurely.

8. **Recent leads** — `cb lead get-lead-2 --sourceId <SOURCE_ID> --pageSize 10 --json`
   to list recent leads on this bot's source, then
   `cb lead get-lead --leadId <LEAD_ID> --json` for one lead's
   `lastMessage`/`lastMessageDirection`/`mostRecentFailureReason`. If AI
   seems off for one lead specifically: `cb lead get-ai-toggle --leadId <LEAD_ID>`.
   There is no full-transcript endpoint — see `references/diagnostic-recipes.md`.

9. **Sandbox reproduce** — `cb bot test <BOT_ID> "<the exact message that caused the issue>" --max-time 30 --json`.
   Reproduces → the bug is in the bot, walk the flow to find the failing
   node. Doesn't reproduce → environmental (lead's data, channel config, a
   GHL custom field). **Deflects with an empty `tools` array** (no
   `get_library_context`/`get_smart_faq` call at all) → the prompt is
   steering the model away from the KB, not a missing-fact problem: (a) a
   plain testSession has no source, so `{{source.*}}` renders empty and
   library/FAQ retrieval never fires — reattach it with `cb bottesting
   put-testsession --botId <BOT_ID> --leadId <leadId> --body
   '{"mimicSourceId":"<src_id>"}'` and retry before touching content; (b)
   check the Job Info text (`variables.business`) for a blank templated
   line (e.g. `Office Hours: ` with nothing after it) — a blank fact in the
   prompt tells the model to hedge before it ever reaches for a tool.

10. **Account-level** — `cb billing get-balance` (out of credits → `420` on
    live messages) and `cb notification get-notifications | jq '.[] | select(.type=="error")'`.
    `460 Account Limit` threshold is undocumented — contact CloseBot support.

**Verify:** after applying a fix, re-run the check that found the issue
(step 2-8) plus step 9 with the original trigger message, and confirm the
symptom is gone before handing off to publish.

See `references/diagnostic-recipes.md` for the full decision tree, common
red herrings, and the jq fix recipes for calendar/brand/flag issues.

## After diagnosis
1. State the root cause, citing which check fired.
2. Hand off the fix: prompt/flag/calendar/scenario edit → `closebot-edit-job-flow`;
   KB attachment → `closebot-attach-knowledge`; scenario → `closebot-add-scenario`;
   going live → `closebot-publish-safely`.

## Tier
0 — every check here is a GET or a self-cleaning sandbox message
(`cb bot test`). Mutating fixes are delegated to other skills, each with
their own tier discipline.

## Gotchas that shaped this skill
- `EnableSmartFaq` and `EnableLibraryContext` are independent — a bot can
  answer FAQs fine while being completely blind to library files.
- `GET /library/files?sourceId=` ignores the query param and returns the
  whole account list — `cb kb verify` already filters client-side.
- There is no `GET /lead/{leadId}/messages` in the CloseBot REST spec —
  don't go looking for a full transcript via the API.
- A deflection on a business fact ("not sure", "team will confirm") is almost
  always a `NOT CONFIRMED` line in the KB, not a flow bug — see
  `closebot-attach-knowledge/references/kb-stale-vector-purge.md`.
- Never hardcode a version when pulling steps — `cb bot audit`/`cb bot pull`
  always resolve the current target.
- A sandbox deflection with a zero-tool-call `tools` array is a prompt-
  steering symptom, not a missing-KB symptom — check `mimicSourceId` on the
  testSession and blank Job Info lines before adding more content
  (2026-09-05, `closebot-attach-knowledge` sandbox probe).

## References
- `references/diagnostic-recipes.md` — decision tree, red-herring table, and
  jq fix recipes for calendar swaps, brand-name cleanup, and booking flags
