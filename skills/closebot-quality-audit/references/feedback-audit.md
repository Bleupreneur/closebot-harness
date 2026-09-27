# Feedback-Based Audit (When the API/GHL Isn't Reachable)

Used when CloseBot 404s, a GHL token is stale, or the conversation is only
available as a tester's written report. Grade from the tester's language
instead of a live transcript.

## Step 1: Extract identifiers from pasted URLs

CloseBot URL:
- `leadId` from `?leadId=`
- `sourceId` from the `filters.values` array

GHL contact URL:
- `locationId` from the path segment after `/location/`
- `contactId` from the final path segment

## Step 2: Map to the bot

Resolve the source name/timezone with `cb source get-source --json`, then
cross-reference against `cb bot audit <id> --json | jq '.sources'` for the
candidate bot(s) — or check your own client notes, if you keep them, for bot id/persona
and known issues on that offer.

## Step 3: Parse the tester feedback

Extract:
- **Specific quotes** — what the bot said/did
- **Behavioral descriptions** — "never responded", "all engagement ended"
- **Tone notes** — "too casual", "robotic"
- **Context clues** — "had to correct it", "asked before on calls"

## Step 4: Symptom → cause map

| Feedback pattern | Likely root | Issue class |
|---|---|---|
| "Already have X" but doesn't | Contact pollution from prior test runs | CB-043 |
| "yeah"/"my bad" / slang | Persona warmth over-tuned | CB-040 |
| No response to "are you a bot?" | Missing identity-probe handler | CB-042 |
| Bot contradicts facts | KB vs inline conflict | CB-016 |
| Silent after trigger | Unclassified intent terminus | CB-004 family |

## Step 5: Grade from feedback

| Dimension | Signal in feedback |
|---|---|
| KB Accuracy | "knowledge...was good" → PASS; factual errors quoted → FAIL |
| Action Correctness | "had to correct it" → FAIL; booking smooth → PASS |
| Tone | "less pushy" → PASS; "too casual" → WARN |
| Safety | Unacknowledged silence → WARN/FAIL |

## Output template (all three paths)

```markdown
## CONVERSATION AUDIT — [Client] [Offer] ([leadId])

**Bot:** [botId] | **Source:** [sourceId] | **Test Date:** [date]

### FEEDBACK SUMMARY
| Dimension | Grade | Notes |
|-----------|-------|-------|
| KB Accuracy | [PASS/WARN/FAIL] | |
| Action Correctness | [PASS/WARN/FAIL] | |
| Tone | [PASS/WARN/FAIL] | |
| Safety | [PASS/WARN/FAIL] | |

**Overall:** [PASS/WARN/FAIL]

### ISSUES
1. **[CB-XXX]** [Title] — [severity]
   - **Symptom:** [quote]
   - **Root cause:** [analysis]
   - **Fix surface:** [where/how]

### RECOMMENDED FIXES
1. [action]
2. [action]
```
