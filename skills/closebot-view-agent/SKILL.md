---
name: closebot-view-agent
description: Use when the user wants to READ, view, audit, or understand how a CloseBot bot is configured — phrases like "view bot X", "show me how bot X is set up", "read/understand bot X", "audit the config of X", "what's in bot X", "walk me through X's job flow", "is X set up correctly". Produces a complete read-only dump of one bot in 13 sections (meta, versions, sources, node inventory, Job Information, Method node flags + section wording, MultiObjective objectives, Scenario triggers, Statements, ModifyTags, the graph, KB per source, and the persona/voice config) plus an automated red-flag scan (orphan nodes, missing calendars, KB-off flags, draft/live drift, title collisions, inline calendar leaks, FRAMEWORK PARITY, and PERSONA checks). Tier 0, all GETs, never mutates or publishes. For viewing MANY bots at once, see $CLOSEBOT_DIR/.claude/workflows/closebot-view-agents.md.
tools: [cb bot list, cb bot audit]
---

# Skill: closebot-view-agent

Comprehensively read ONE CloseBot bot, fast. Read-only. Understand how a bot
is actually configured — prompts, flags, calendar, KB, flow graph — without
clicking through the UI, and surface obvious misconfigurations automatically.

This skill only reads. It never edits, saves, or publishes. When it finds
something to fix, it hands off to the right mutating skill.

## When to use
- "view bot X" / "how is X set up?" / "walk me through X's job flow"
- "audit the config of X" / "is X set up correctly?" / "dump bot X"
- Before editing a bot you haven't seen — view it first

## Do not use when
- Viewing MANY bots at once (fleet compare) → `$CLOSEBOT_DIR/.claude/workflows/closebot-view-agents.md`
- Editing any property/flag/calendar/prose → `closebot-edit-job-flow`
- Repurposing a duplicated bot for a new client → `closebot-repurpose-bot`
- Adding a scenario interrupt → `closebot-add-scenario`
- Bringing a bot up to the canonical template → `closebot-apply-template`
- Uploading/attaching knowledge → `closebot-attach-knowledge`
- A bot is actively misbehaving (symptom-driven, needs live conversations + sandbox repro) → `closebot-debug-bot`
- Publishing a draft live → `closebot-publish-safely`

`closebot-debug-bot` overlaps but is symptom-driven (something's broken, find
why). This skill is config-driven (show me everything, cleanly). Reach for
this one first to *understand*; debug when something needs *fixing*.

## Procedure
1. If given a bot name instead of an id: `cb bot list | grep -i "<name>"` to
   find the `bot_...` id.
2. `cb bot audit <BOT_ID>` — human-readable 13-section report (wraps
   `scripts/cb-view-agent.sh`); defaults to the head version (highest semver, as `cb bot version` .target) —
   what the user is editing. Pass an explicit version to see what leads
   actually get instead.
3. `cb bot audit <BOT_ID> --json` — same data as a single JSON object, for
   programmatic use or feeding the fleet workflow.
4. Read section 12 (red-flag scan) and section 13 (persona) first — see
   `references/red-flags.md` for the full catalog of what each finding means
   and why it matters. Cross-check pricing/deposit/hours across Job
   Information, Method sections, and objectives — the scan only auto-detects
   some contradictions.
5. Summarize for the user: what the bot does, what calendar/offer it books,
   where its knowledge comes from, and anything from the red-flag scan.
   Cite node titles. Hand off any fix to the matching skill above — this
   skill does not mutate.
6. Verify: `cb bot audit <BOT_ID> --json | jq '.framework_parity.on_framework'`
   — `false` means the bot is missing the canonical agent-node set; splice
   via `closebot-apply-template` before calling any rebuild done.

## Tier
0 — every call is a GET (`GET /bot/{id}`, `GET /bot/{id}/steps`,
`GET /smart-faq`, `GET /library/files`, `GET /persona`). No mutation, no
publish, no sandbox messages. Safe to run any time without confirmation.

## Gotchas that shaped this skill
- A no-persona duplicate reads clean on every node-level check yet won't
  reply at all (`persona.attached:false`) — GOTCHAS.md 2026-06-22 row; added
  as its own section-13 check 2026-08-11.
- `EnableSmartFaq=true` does NOT cover library files — check
  `library_readability.attached_but_unreadable` separately, added 2026-06-24.
- Never hardcode a version (e.g. `0.0.1`) — `cb bot audit`/`cb bot version`
  always resolve the real target.
- `cb bot audit --json` emits a `red_flags[]` array (`{code, severity:
  "FAIL"|"WARN", message}`), built from the same §12 predicates as the
  human-mode red-flag scan — `cb bot publish`'s pre-flight filters it for
  `severity === "FAIL"` and refuses to publish if any exist, alongside the
  separate `framework_parity.on_framework` gate (fixed 2026-09-05; GOTCHAS.md
  2026-09-04 row).

## References
- `references/red-flags.md` — full 13-section index, the complete red-flag
  catalog (what each finding means, why it matters, a live
  example), and common pitfalls
