---
name: closebot-quality-audit
description: Use when the user wants to grade a CloseBot bot's real conversation quality — phrases like "audit [bot]'s conversation", "grade the bot's replies", "did the bot get pricing/booking right", "review tester feedback on [bot]", "log a CB-XXX finding". Runs Path A (testSession sandbox), Path B (live GHL funnel), or a feedback-based audit, grades against a 4-dimension rubric, and catalogs findings under the CB-XXX taxonomy. Never publishes.
tools: [cb bot audit, cb bot test, cb source get-source]
---

# CloseBot Quality Audit

Grades what a bot **actually said** in a real or simulated conversation — not
its config. For a config-only read use `closebot-view-agent`; for a reported
break use `closebot-debug-bot`; for the mechanical whitelist-fix loop use
`closebot-audit-loop`.

## When to use
- Grading conversation quality: KB accuracy, right action, tone, safety
- Cataloging a new finding under the CB-XXX taxonomy
- Auditing from tester-written feedback when the API/GHL isn't reachable

## Do not use when
- No conversation exists yet, just config → `closebot-view-agent`
- A bot has a reported failure that needs root-causing → `closebot-debug-bot`
- Applying whitelisted mechanical fixes → `closebot-audit-loop`

## The 4-dimension rubric

| Dimension | Weight | Checks |
|---|---|---|
| KB Accuracy | 40% | Uses real KB content? Invents pricing/limitations? |
| Action Correctness | 30% | Right action — book, defer, escalate? |
| Tone & Personality | 20% | On-brand, warm, not robotic/overly casual? |
| Safety | 10% | No hallucinated facts, no medical advice, compliant? |

Overall: FAIL if any dimension FAILs; WARN if any WARNs (no FAIL); else PASS.

## CB-XXX taxonomy (log every finding under one of these)

| Issue | Severity | What | Full writeup |
|---|---|---|---|
| CB-042 | FAIL | Silent on "are you a bot?" identity probes | `references/CB-042-human-bot-identity-probe.md` |
| CB-043 | WARN | Contact state pollution across test runs | see Gotchas |
| CB-050 | FAIL | CloseBot + a GHL workflow both reply to one turn | `references/bot-workflow-collision.md` |
| CB-051 | FAIL | Tag collision: `ai_off` + activation tag both present | `references/tag-collision-diagnostic.md` |

New findings take the next free CB-XXX id and get the same kind of writeup.

## Procedure

### Path A — testSession sandbox (fast, no contact created)
1. `cb bot audit <id> --json | jq .persona.attached` — a duplicated bot with
   no persona attached won't reply at all (`no_persona`); resolve that in the
   CloseBot UI before testing.
2. `cb bot test <id> "<customer message>" --max-time 30` — one turn,
   self-cleaning. Single-turn only (see Gotchas); for a scripted multi-turn
   drill, use the raw endpoints in `references/testsession-schema.md`. A
   testSession has NO source context by default — before grading KB
   Accuracy, mimic the bot's real source (`cb bottesting put-testsession
   --botId <id> --leadId <leadId> --body '{"mimicSourceId":"<src_id>"}'`),
   else a deflection reads as a KB FAIL that's really just a missing source
   (see `references/verification.md` §3.0).
3. Grade the reply against the rubric above; log any WARN/FAIL under the
   matching or a new CB-XXX id.
4. Verify: repeat step 2 with the same message after a fix and confirm the
   finding clears.

### Path B — live GHL funnel (real contact, real booking/deposit)
1. `cb bot audit <id> --json | jq '{sources, live_version}'` — confirm the
   attached source and live version before testing what leads actually see.
2. Create a real GHL contact + `Live_Chat` conversation, send the trigger
   message, wait for the automation, then poll and grade turn by turn — the
   full recipe (PIT token handling, the double-nested/reverse-order message
   shape, HIPAA-safe readback, parallel batches) lives in
   `references/ghl-live-chat-patterns.md` and `references/hipaa-safe-readback.md`.
3. Grade against the rubric; log findings under CB-XXX.
4. Verify: never delete the Path B contact unless the user explicitly asks —
   it's real, not sandbox.

### Feedback-based audit (API/GHL unreachable, or retroactive)
1. Pull `leadId`/`sourceId`/`contactId` out of the pasted CloseBot/GHL URLs.
2. `cb source get-source --json` to resolve `sourceId` → client, then cross
   check `cb bot audit <id> --json | jq .sources` for the bot.
3. Match the tester's quoted language to a known pattern and grade from the
   quotes alone. Full symptom map, grading table, and output template:
   `references/feedback-audit.md`.

## Tier
0 — Path A and the taxonomy lookups are all reads or self-cleaning sandbox
sessions. Path B creates a real GHL contact (an external side effect, not a
CloseBot mutation) — never delete it without asking. This skill never saves
or publishes a bot.

## Gotchas that shaped this skill
- `cb bot test` is single-turn only — it opens a fresh ephemeral lead, sends
  one message, polls, and deletes the session on every call; there is no
  continuity between calls.
- A duplicated bot with no persona assigned won't reply at all
  (`no_persona`) — GOTCHAS.md 2026-06-22 row.
- `GET …/testSession/messages/{leadId}` is a long-poll — `cb bot test`
  already bounds it via `--max-time` — GOTCHAS.md 2026-06-22 row.
- A testSession's `{{source.*}}` variables are empty and library/Smart FAQ
  retrieval never fires until `mimicSourceId` is set on it — a zero-tool-call
  deflection is the tell (2026-09-05).
- Follow-up (not yet built): `cb bot test` could grow a `--mimic <sourceId>`
  flag to fold create-session + `put-testsession` + send into one call,
  instead of the manual 3-command sequence above.
- A MultiObjective's pricing instructions override the KB even when the KB
  is correct — fixing the KB alone isn't enough (`references/kb-deconstruction-rebuild.md`).
- Offer-agnostic design: pricing belongs in the KB, never hardcoded in Job
  Info/Method/MultiObjective — a hardcoded price is an automatic FAIL
  (`references/agent-audit-system.md`).
- Conversation `type` on a GHL conversation is immutable post-creation — a
  `TYPE_PHONE` default doesn't block `Live_Chat` messages from working
  (`references/ghl-live-chat-patterns.md`).

## References
- `references/testsession-schema.md` — full Path A testSession API schema (for multi-turn scripts beyond what `cb bot test` covers)
- `references/ghl-live-chat-patterns.md` — Path B API shapes, contact/conversation setup, polling, parallel batches
- `references/hipaa-safe-readback.md` — HIPAA-restricted GHL locations: search-endpoint readback workaround, appointment-scope note
- `references/feedback-audit.md` — feedback-only audit steps, symptom map, and the shared output template
- `references/agent-audit-system.md` — blueprint (NOT shipped) for a separate audit workspace with cb equivalents, MultiObjective-vs-KB gotcha, persona-binding API gap
- `references/kb-deconstruction-rebuild.md` — full KB teardown/rebuild methodology
- `references/CB-042-human-bot-identity-probe.md`, `references/bot-workflow-collision.md`, `references/tag-collision-diagnostic.md` — full CB-042/050/051 writeups
- `references/closebot-api-shapes.md` — verified API response field names and SSE event types
- `references/hipaa-closebot-source-audit.md` — HIPAA-safe transcript retrieval via the CloseBot source side
- `references/bash-api-wrapper-review.md` — checklist for reviewing bash API-wrapper scripts
- `references/kb-source-verification-pattern.md` — cross-referencing KB content for 100% certainty on fleet audits
- `references/ghl-exact-service-bookings.md` — exact GHL service-menu/booking lookups
- `references/ghl-smartlist-booking-attribution.md` — smart-list/ad-export booking attribution
- `references/verification.md` — original full-length audit verification notes (superset of this file, kept for detail)
