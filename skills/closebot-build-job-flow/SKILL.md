---
name: closebot-build-job-flow
description: Use when the user wants to design a CloseBot job flow from scratch — phrases like "build a flow for [purpose]", "design a bot that does X", "create a job flow", "I want a CloseBot agent that [behavior]". Walks an industry-aware Q&A to elicit the conversation goal, then assembles a fresh steps.json using the 27 atomic node types, validates it, and saves as a draft. Does NOT publish (use closebot-publish-safely separately).
tools: [cb bot version, cb bot post-duplicate, cb bot put-bot, cb bot pull, cb bot push, cb bot post-savetools, cb bot post-source, cb bot test]
---

# Skill: closebot-build-job-flow

> Before changing anything, load the mental model: [`../../docs/HOW-CLOSEBOT-WORKS.md`](../../docs/HOW-CLOSEBOT-WORKS.md) (plugin install: `"$(cb root)/docs/HOW-CLOSEBOT-WORKS.md"`), especially §4, the safe change loop.

Design a CloseBot job flow from a blank slate. Output: a saved draft ready for
sandbox testing.

## When to use
- "build a flow for X" / "design a CloseBot agent that does Y"
- "create a job flow from scratch" / "I want a bot that [behavior]" — and no
  template already covers this use case

## Do not use when
- A template bot already exists for this use case → `closebot-onboard-client`
  (clone + customize is faster and lands on-framework for free)
- Any client booking bot, once you have a template — prefer cloning your
  template bot (`$CB_TEMPLATE_BOT`) via `closebot-onboard-client` over
  hand-assembly. If you DO hand-assemble (e.g. building your first template),
  the result must pass
  `cb bot audit <id> --json | jq .framework_parity.on_framework` — the
  recommended agent-node set is listed in `closebot-apply-template`.
- Editing an existing bot → `closebot-edit-job-flow`
- Adding a scenario interrupt → `closebot-add-scenario`
- Uploading knowledge → `closebot-attach-knowledge`

## Procedure
1. Design Q&A — ask in one message: purpose, channel(s), entry, success state,
   failure/handover triggers, integrations (booking calendar? contact fields?
   tags? webhook? email? KB?), source (client sub-account), bot name. Don't
   proceed without purpose, channel, success state, source, and name.
2. Pick a structural pattern from `references/patterns.md` (qualification→
   booking, FAQ deflection, appointment reminder, multi-stage branching, or
   custom) based on purpose + success state.
3. Clone a skeleton rather than hand-assembling node IDs/positions:
   `cb bot post-duplicate --id <skeleton_bot_id>` → note the returned `.id`,
   then `cb bot put-bot --id <new_id> --body '{"name":"<Bot Name> [DRAFT]"}'`.
4. `cb bot version <new_id>` then `cb bot pull <new_id> --out steps.json` — a
   fresh duplicate has one version, but resolve it rather than assuming `0.0.1`.
5. Reshape `steps.json` with `jq` to match the pattern — per-node-type `data`
   block examples (Method, Comparator, Booking, ModifyTags, WebHook) in
   `references/patterns.md`; full schema in `schema/node-descriptors.json`.
6. Validate before saving — the 5 checks in `references/patterns.md` (unique
   IDs, no dangling edges, every Booking/booking-Method has a calendar, a
   Source node exists). Fix and re-check on any FAIL.
7. `cb bot push <new_id> steps.json` — same exit-3 semantics as
   `closebot-edit-job-flow`: non-empty `invalidPaths` → fix and retry; the
   clobber message → close the `app.closebot.com` editor tab and push again.
8. `cb bot post-savetools --id <new_id> --body '[{"type":"SmartFAQ","enabled":true,"options":{}}, ...]'`
   — account-level tools per the Q&A. Body must be a raw JSON array.
9. `cb bot post-source --id <new_id> --sourceId <src_id> --body '{"channels":[],"tags":[],"enabled":true}'`
   — attach the client source. Delegate any file/FAQ/scrape upload to
   `closebot-attach-knowledge`.
10. Report: bot id, pattern used, node/tool counts, source attached, draft not
    published. Hand off: `cb bot test <new_id> "message"` to sandbox-test (or
    `closebot-debug-bot` to walk it), then `closebot-publish-safely` to ship.

## Tier
1 — every write here is a reversible draft (duplicate, save, saveTools, source
attach). Never publishes; that's `closebot-publish-safely` (Tier 2).

## Gotchas that shaped this skill
- Never hand-craft a graph in an empty file — clone a skeleton so React Flow
  internal fields (position, handles) survive; see the failure mode this
  avoids in `closebot-edit-job-flow/references/api-build-pattern.md`.
- `bot post-savetools` needs `bodyShape: array` — pass a raw JSON array, not
  `{"tools":[...]}`.
- A small hand-built example bot is not the recommended framework — check
  `framework_parity` before using any bot as a template.

## References
- `references/patterns.md` — the 5 structural patterns, per-node-type `data`
  block examples, the full validation block, and common pitfalls.
- `docs/AGENT-BUILDING.md` — the complete 27-node-type table and account tool
  list (external, not skill-owned).
- `references/custom-tool-integrations.md` — verified `customTools[]` JSON shape,
  the Slack team-alert tool, the wiring checklist, and the 2026-09-05
  parameter-binding defect (only `{{contact.*}}` renders).
- `references/ghl-service-bookings-wiring.md` — IV/aesthetics services are GHL
  Service Bookings, not calendars: live-tested endpoints, the three tools, and the
  `source.calendar_id` flow-variable fix for "No calendars are available".
