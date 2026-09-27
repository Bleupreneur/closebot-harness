
# CloseBot Bot Audit & Verification

Comprehensive workflow for auditing CloseBot bots with 100% source-cited certainty.

## When to Use

- Fleet-wide bot audits (Ultra rebuilds, template migrations)
- KB verification against Google Drive and Slack sources
- Path A (testSession) smoke testing
- Path B (live funnel) validation
- Pre-publish configuration checks

## Prerequisites

- `CLOSEBOT_API_KEY` exported, or in `<repo>/.env` (`cp .env.example .env && chmod 600 .env`)
- Bot ID from the CloseBot UI or `cb bot list`
- Source ID for KB verification
- The client's ground truth (current ad copy + owner-confirmed price list)

## Phase 1: Configuration Analysis

### 1.1 Pull Bot Metadata

```bash
# Load the key (skip if already exported) and get bot info
set -a; . ./.env; set +a
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/{BOT_ID}" | jq .
```

**Check these fields:**
| Field | What to Verify |
|-------|----------------|
| `personaIds` | Should match expected persona (e.g. `pers_XXXXXXXXXXXXXXXX`, or a name override) |
| `sources` | Should NOT be empty for KB-enabled bots |
| `versions[].published` | Latest should be published for production |
| `category` | Should be "GHLS" for GHL-integrated bots |

### 1.2 Pull Job Flow (Graph)

```bash
# Get steps for specific version
# IMPORTANT: version resolution must use highest semver, NOT "last unpublished"
# The heuristic (.versions | map(select(.published==false)) | last) resurrects
# STALE drafts on published-head bots — known trap in CloseBot GOTCHAS.md
# `cb bot version <bot_id>` resolves this correctly (highest semver + current live);
# `cb bot pull <bot_id>` pulls that version.
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/{BOT_ID}/steps?botVersion={VERSION}" | jq '.' > steps-v{X}.{Y}.json
```

**Verify:**
- `invalidPaths: []` (empty = valid graph)
- Node count matches expected structure
- Calendar IDs are client-correct (not template defaults)
- Pricing nodes match client's offer truth
- **Offer-agnostic check (CRITICAL):** NO offer-specific pricing should
  exist in Job Info (variables.business), Method node sections, or
  MultiObjective instructions. All pricing must live in the KB (Smart
  FAQs + library files). A bot with hardcoded pricing like "lip filler
  is $X" in the agent prompt is a FAIL. The MultiObjective "Handle
  Pricing" should say "use the knowledge base to answer pricing questions"
  NOT quote specific prices.
- **MultiObjective OVERRIDES KB (learned live 2026-07-06):** The
  MultiObjective instructions sit in the system prompt — the LLM
  prioritizes them over KB (RAG) retrieval. If the MultiObjective says
  "Service A is $20/unit" and the KB Smart FAQ says "$10/unit (offer)", the
  bot quotes $20. Fixing the KB alone is NOT enough. You MUST also strip
  all specific pricing from the MultiObjective instructions and replace
  with "Look up all pricing from the KB using Smart FAQs and library
  context. Do not quote prices from memory." Add the rule: "When a lead
  comes from an ad, the offer price in the KB is the price to quote.
  Offer pricing overrides standard pricing." Then publish the draft
  (flow edit requires publish; KB edits go live on re-index). Verify with
  a diff of the pulled vs edited `steps.json` that no pricing remains.
  See `kb-deconstruction-rebuild.md` for the full procedure.

### 1.3 Leak Assert

Check for template contamination:
```bash
# Search for wrong client data
grep -i "old brand name\|old provider name\|old offer name" steps-v*.json && echo "LEAK DETECTED"
grep "\$<old price>\|\$<old deposit>" steps-v*.json  # Should match only if correct client
```

## Phase 2: KB Verification (Multi-Source)

### 2.1 Dispatch Parallel Verification

For 100% certainty, fan out delegates to check ALL sources:

```python
# Delegate pattern for multi-source verification
delegate_task(tasks=[
    {
        "goal": "Verify KB against Google Drive Marketing > Clients > {CLIENT}",
        "context": "Check Drive docs for pricing, services, provider info",
        "toolsets": ["web", "search", "terminal", "file"]
    },
    {
        "goal": "Verify KB against Slack #{channel}",
        "context": "Search Slack for owner confirmations of pricing/services",
        "toolsets": ["web", "search", "terminal", "file"]
    },
    {
        "goal": "Cross-reference repo CLAUDE.md, offers/, ISSUES.md",
        "context": "Verify local KB files match extracted source intel",
        "toolsets": ["file", "search"]
    }
])
```

### 2.2 Verification Checklist

| Category | Verify Against | Confidence Target |
|----------|----------------|-------------------|
| **Pricing** | Owner Slack messages, Drive pricing sheets | 100% (owner direct) |
| **Provider Identity** | Slack owner confirmations | 100% |
| **Services** | Drive service menus, website | 100% |
| **Hours** | Slack, Drive, website | 100% or flag gap |
| **Deposit/Policy** | Slack owner + account-manager confirmations | 100% |
| **Neurotoxin Brand** | Slack owner explicit statement | 100% |

### 2.3 RAG Format Compliance

KB must have:
- [ ] Clear hierarchical headers (`## Practice Overview`, `## OFFER 1`)
- [ ] Bullet-point retrievable chunks (not paragraphs)
- [ ] "READ FIRST" section for critical facts (deposit truth)
- [ ] Explicit anti-hallucination rules
- [ ] FAQ Quick Reference with Q/A pairs
- [ ] Source attribution where available

## Phase 3: Path A Testing (testSession)

### 3.0 Multi-Turn Reactive Probe (preferred for persona changes & multi-offer bots)

When a bot has multiple offers OR a persona was recently changed, single-turn smoke is insufficient. Run a **multi-turn reactive conversation** that systematically probes every offer surface. Persona changes can silently override pricing objective nodes — a bot that answered pricing on version N may defer to the team on version N+1 with zero graph edits.

All Path A primitives go through `cb`. One session, many turns:

```bash
BOT="bot_XXX"
LEAD=$(cb bottesting post-testsession --botId "$BOT" --body '{}' --json | jq -r '.leadId')   # create once
trap 'cb bottesting delete-testsession --botId "$BOT" --leadId "$LEAD" >/dev/null' EXIT      # cleanup on any exit

# Each turn: send + poll + extract, in the SAME session (conversation memory carries over)
cb bot test "$BOT" "Hi! I saw an ad for lip filler..." --lead "$LEAD" --max-time 15 --json | jq -r '.replies[]'
# ...react to the reply, write the next turn in response...
```

Without `--lead`, `cb bot test` opens and deletes its own session per call — fine for a single-turn smoke, useless for a reactive probe.

**No source context by default (verified 2026-09-05):** every testSession — `--lead` or not —
runs against a synthetic `src_test_*` source. `{{source.*}}` variables render empty and the
bot's attached-source Smart FAQs/library files are never consulted, so a KB Accuracy grade off
a plain testSession can read as a FAIL that's really just missing source context. Point the
session at the bot's real source first: `cb bottesting put-testsession --botId "$BOT"
--leadId "$LEAD" --body '{"mimicSourceId":"<src_id>"}'` (get `<src_id>` from `cb bot audit <id>
--json | jq .sources`). A deflection with zero tool calls in the JSON `tools` array is the tell —
check `mimicSourceId` before grading it a real KB miss.

**Probe matrix for multi-offer bots** — hit every offer the bot handles, in this order:

| Turn | Probe | What to verify |
|------|-------|----------------|
| 1 | Opener / "what do you offer?" | Identity, persona warmth, no wrong-offer pitch |
| 2 | Primary offer pricing | Correct price from KB |
| 3 | Upsell / full-quantity probe | DEFER (never quote a dropped/unknown price) |
| 4 | Secondary offer pricing | Answer-on-ask if menu item; team-defer if not quotable |
| 5 | Retired offer mention | Deflect ("I don't have details" / no pitch) |
| 6 | Deposit / refundability | Correct amount + "goes toward service" |
| 7 | Tertiary / new offer | Correct facts, no fabrication |

**Persona-change regression pitfall (learned 2026-07-03):**
When a new persona is attached to an existing bot, re-probe EVERY offer surface — not just the primary funnel. On one client bot, version N answered a secondary service's per-unit price answer-on-ask; version N+1 with a new persona silently regressed to team-defer for that service despite zero graph edits. The persona instructions were routing those queries to a handover path before the pricing objective node fired. Fix surface: check if the persona instructions suppress pricing answers, and ensure the pricing objective/scenario node fires for direct pricing questions before routing to team handover.

**Reusable probe script:** `references/scripts/multi-offer-probe.sh <bot_id> <run_dir> [timeout]
[mimic_source_id]` — runs the full 7-turn probe matrix above against any bot via `cb`, and
mimics the bot's real source when the optional 4th arg is given (see above). Edit the `TURNS`
array for client-specific scenarios.

### 3.1 Create Test Session

```bash
curl -s -X POST \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.closebot.com/bot/{BOT_ID}/testSession"
# Returns: {"leadId": "lead_test_XXX", "sourceId": "src_test_XXX"}
```

### 3.2 Send Message & Poll SSE

```bash
# Send message (fire-and-forget — 200 empty body, do NOT parse as JSON)
curl -s -X POST \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"leadId": "LEAD_ID", "message": "TEST_MESSAGE"}' \
  "https://api.closebot.com/bot/{BOT_ID}/testSession/message"

# Poll SSE for response — stream stays open indefinitely, set --max-time
curl -s -N --max-time 30 \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/{BOT_ID}/testSession/messages/{LEAD_ID}"
```

**Parse for:** `data: {"type": "message-sent", "message": "..."}`

**CRITICAL PITFALL — SSE + `set -euo pipefail`:**
The SSE stream stays open indefinitely. `curl --max-time` ALWAYS exits 28 (timeout) even when the bot replied successfully. Under `set -euo pipefail`, this kills the script before output is processed. Additionally, `grep` exits 1 when no matches are found (e.g., if the reply hasn't arrived yet), which also kills the script. The fix requires `|| true` on BOTH commands:

```bash
# WRONG — kills script under set -e
REPLY=$(curl -s --max-time 30 "$URL" 2>/dev/null | grep "^data:")
BOT_TEXT=$(echo "$REPLY" | grep '"type":"message-sent"' | ...)

# CORRECT — tolerate timeout exit 28 and grep no-match exit 1
REPLY=$(curl -s --max-time 30 "$URL" 2>/dev/null || true)
REPLY=$(echo "$REPLY" | grep "^data:" || true)
BOT_TEXT=$(echo "$REPLY" | grep '"type":"message-sent"' | ... || true)
[[ -n "$BOT_TEXT" ]] || BOT_TEXT="(no reply within 30s)"
```

**Multi-message replies:** CloseBot may send multiple `message-sent` events per turn. Concatenate ALL of them, not just the first:

```bash
BOT_TEXT=$(echo "$REPLY" | grep '"type":"message-sent"' | sed 's/^data: //' | \
  jq -r '.message // empty' 2>/dev/null | grep -v '^$' | paste -sd' ' - || true)
```

**Tool debugging:** Extract `tool_use` events to see which tools the bot called:
```bash
TOOLS=$(echo "$REPLY" | grep '"type":"tool_use"' | sed 's/^data: //' | \
  jq -r '.toolName // empty' 2>/dev/null | sort -u | paste -sd', ' - || true)
```

**SSE event types:** `connected` (handshake), `logs` (execution trace with prompts/tokens), `tool_use` (bot called a tool), `action` (action node fired), `activity` (UI-facing event mirror), `message-sent` (final reply — extract `.message`), `bot_done` (turn complete — terminal event).

### 3.3 Critical Test Scenarios

| Test | Input | Expected | Why Critical |
|------|-------|----------|--------------|
| Services | "What services do you offer?" | Lists correct services | Baseline functionality |
| Pricing | "How much is X?" | Correct price or defer | Offer truth verification |
| Botox Brand | "Do you do Botox?" | Correct brand or defer | Neurotoxin accuracy |
| GLP-1 | "Do you offer semaglutide?" | Affirm if offered, defer if not | Cross-client contamination check |
| Medical Contra | "I'm pregnant" | Human handover | Safety escalation |
| Pricing Objection | "I saw it cheaper" | Value reframe, no discount | Discount discipline |

### 3.4 Cleanup

```bash
curl -s -X DELETE \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/{BOT_ID}/testSession/{LEAD_ID}"
```

## Phase 3.5: Audit real CloseBot conversations without GHL message access

For HIPAA-enabled GHL locations where `/conversations/{id}/messages` and `/conversations/messages/export` return 401, CloseBot's metric API can still expose the CloseBot-side transcript stream:

```bash
# Count messages for a source/date window
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/botMetric/messageCount?sourceId=$SOURCE_ID&start=$START_ISO&end=$END_ISO"

# Retrieve one bounded transcript partition; group final rows by leadId
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/botMetric/messages?sourceId=$SOURCE_ID&start=$START_ISO&end=$END_ISO&maxCount=100"
```

**Critical cap:** `/botMetric/messages` silently returns at most 100 rows even if a larger `maxCount` is requested, and it has no cursor. Split the window into daily ranges; whenever a range returns exactly 100 rows, recursively bisect it. Deduplicate by `messageId` and require the final unique row count to equal `/botMetric/messageCount` before claiming completeness.

Each message can include `leadId`, `botId`, `personaId`, `channel`, `fromBot`, `direction`, `message`, `timestamp`, and `activities`. Crosswalk `leadId` to GHL `contactId` through `/lead/search`; its POST body must explicitly include `channels: []`, `botIds: []`, and `personaIds: []`, and successful rows are under `leads`. This supports real-conversation QA, response counts, bot/human separation, first-response timing, unanswered-lead detection, activity/tool evidence, and redacted transcript samples even when GHL HIPAA message reads are blocked.

`GET /lead/{leadId}/messages` may return 404 and is not the reliable live-history route. Use `/botMetric/messages`. Large `/botMetric/logs` source-wide queries may time out (504); narrow logs by `leadId` or `messageId` when execution traces are needed.

See `hipaa-closebot-source-audit.md` for the validated recursive retrieval, lead crosswalk, call-evidence fallback, screening flags, and PHI-safe reporting pattern.

## Phase 4: Common Issues Catalog

### UI Gates (Blocked on CloseBot UI)

| Gate | Symptom | Fix |
|------|---------|-----|
| **No Persona** | `personaIds: []` or wrong persona | Assign in CloseBot UI |
| **No Source** | `sources: []` | Re-attach GHL source in UI (OAuth) |
| **Draft Unpublished** | `published: false` on latest | Click "Publish" in UI |

### KB Issues

| Issue | Detection | Fix |
|-------|-----------|-----|
| **Empty Source** | 0 Smart-FAQs, 0 library files | Build KB from spec |
| **Null FAQs** | Answers = `null` | Populate or fold into RAG |
| **Cross-Client Leak** | Wrong provider/pricing in responses | Leak assert + re-template |
| **RAG Format Bad** | Narrative paragraphs, no headers | Restructure to bullet facts |

### Config Drift

| Issue | Detection | Fix |
|-------|-----------|-----|
| **Node ID Contamination** | Template/source-bot IDs left in the clone | `closebot-edit-job-flow` to fix |
| **Calendar Wrong** | Old template calendar ID | Search/replace all occurrences |
| **Pricing Contradiction** | Different prices in different nodes | Consolidate to single source of truth (KB only). If the MultiObjective "Handle Pricing" has hardcoded prices that conflict with the KB, the MultiObjective wins — strip all pricing from it and redirect to KB. See `kb-deconstruction-rebuild.md`. |

## Phase 5: Report Template

```markdown
## BOT AUDIT REPORT — {CLIENT}

### Configuration
| Field | Value | Status |
|-------|-------|--------|
| Bot ID | `bot_XXX` | ✅ |
| Persona | Expected persona name | ✅/❌ |
| Source | `src_XXX` | ✅/❌ |
| Published | vX.Y.Z | ✅/❌ |
| invalidPaths | [] | ✅ |

### KB Verification
| Fact | Source | Status |
|------|--------|--------|
| Pricing $X | Slack owner | ✅ 100% |
| Provider | Drive bio | ✅ 100% |

### Path A Tests
| Scenario | Result | Grade |
|----------|--------|-------|
| Services list | Correct | ✅ PASS |
| Pricing | Correct | ✅ PASS |

### Blockers
- [ ] UI Gate: Persona assignment
- [ ] UI Gate: Source re-attachment
- [ ] KB: 9 null FAQs need population
```

## See Also

- This repo's `GOTCHAS.md` and `cb`
- **Optional standalone audit workspace (blueprint, not shipped):** `references/agent-audit-system.md` describes how to build a separate per-client audit workspace with a small team of single-purpose agents (Builder, QA, Librarian, Error Doctor + the skill-retro loop). None of its scripts ship with this repo; every read/edit it needs has a `cb` equivalent (`cb bot pull/push/test/audit/version`, `cb smartfaq ...`, `cb library ...`, `cb kb ...`).

## References

- `references/bash-api-wrapper-review.md` — Checklist for reviewing bash API-wrapper scripts (HTTP status validation, array-type guards, null-guards, dead variables, 404 detection, version resolution, boolean coercion, non-JSON guards). 8 bugs found applying this to agent-audit scripts.
- `references/testsession-schema.md` — Original testSession schema capture
- `references/closebot-api-shapes.md` — Verified API response field names, SSE event types, and jq patterns (2026-07-06)
- `kb-deconstruction-rebuild.md` — Full KB deconstruction and rebuild methodology: how to audit, tear down, and rebuild a CloseBot KB from scratch using CloseBot's KB best practices. Covers Smart FAQ cleanup, library file structure, offer-vs-standard pricing override pattern, and the critical MultiObjective override pitfall. Includes a live rebuild case study (2026-07-06).
- See also `closebot-quality-audit` → `references/agent-audit-system.md` — blueprint (not shipped) for a standalone audit workspace