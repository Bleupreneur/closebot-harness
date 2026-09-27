# Playbook 7 — Test a bot in a sandbox session

**Tier 1**. Test sessions are isolated — they don't fire integrated channels (SMS, GHL, etc.). Use these for every bot edit before publishing.

## 1. (Tier 1) Create a test session

```bash
BOT_ID="<bot id>"
# Body is an empty object — there is no leadName/name field. Response is { leadId, sourceId }.
LEAD_ID=$(curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/testSession" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.leadId // empty')
[[ -n "$LEAD_ID" ]] || echo "session create failed (no_persona on a fresh duplicate? — assign a persona in the UI first)"
```

Verified live (2026-09-04). A fresh duplicate that has no persona assigned will not reply — check `GET /bot/$BOT_ID/testSession` for `mostRecentFailureReason: "no_persona"`.

## 1b. (Tier 1) Give the session a real source (source variables + KB)

A fresh test session runs against a synthetic `src_test_*` source: `{{source.*}}` variables render
empty and the bot's attached-source Smart FAQs / library files are **not** consulted. Point it at a
real source before the first message (verified 2026-09-05 on the sandbox — hours, walk-ins and a
library-only question all answered, `get_library_context` fired):

```bash
curl -sS -X PUT "https://api.closebot.com/bot/$BOT_ID/testSession/$LEAD_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"mimicSourceId": "src_XXXX"}'
# cb equivalent: cb bottesting put-testsession --botId $BOT_ID --leadId $LEAD_ID --body '{"mimicSourceId":"src_XXXX"}'
```

Test sessions run the bot's **working draft**, which is normally the head version (highest semver, as `cb bot version <id>` `.target`), not the live one. Which version a test session uses when the head is already published is unverified.

## 2. (Tier 1) Send a message into the test session

```bash
curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/testSession/message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "'"$LEAD_ID"'",
    "message": "Hi, I want to know your hours."
  }'
```

## 3. (Tier 0) Stream / poll messages

This endpoint is an **SSE long-poll**, not a JSON array. A bare `curl` never returns — always set `--max-time`. Hitting the timeout is expected; parse the `data:` lines you collected.

```bash
RAW=$(curl -sS --max-time 30 -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BOT_ID/testSession/messages/$LEAD_ID" 2>/dev/null || true)
EVENTS=$(echo "$RAW" | grep '^data:' | sed 's/^data: //')

# Bot replies:  {"type":"message-sent","message":"..."}
echo "$EVENTS" | jq -r 'select(.type=="message-sent") | .message'
# Tool calls:   {"type":"tool_use","toolName":"...","arguments":"{...json...}","result":"..."}
echo "$EVENTS" | jq -r 'select(.type=="tool_use") | "\(.toolName) \(.arguments) -> \(.result)"'
# Rendered outbound HTTP calls (what CloseBot actually sent after {{token}} substitution) + LLM calls:
echo "$EVENTS" | jq -r 'select(.type=="logs") | .logs[] | select(.severity==6) | .message'   # "200 GET https://…"
echo "$EVENTS" | jq -r 'select(.type=="logs") | .logs[] | select(.model!=null) | "\(.purpose) \(.model) \(.promptTokens)/\(.completionTokens)"'
```

Open the stream **before** sending the message — it does not replay history (a reconnect yields
only `connected`). Verified 2026-09-05: this is how the custom-tool `UNRESOLVED(<param>)` bug
was proven to be CloseBot's (see GOTCHAS 2026-09-05).

Cheaper alternative when you only need the last reply and status: `GET /bot/$BOT_ID/testSession` returns `lastMessage` + `mostRecentFailureReason` without holding a connection open.

## 4. (Tier 1) Force the next step (skip waits, advance flow)

```bash
curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/testSession/$LEAD_ID/force-step" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

## 5. (Tier 2) Roll back the session to a previous state

```bash
curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/testSession/$LEAD_ID/rollback" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "step": 3 }'
```

Confirm with user — rollback discards intermediate state.

## 6. (Tier 2) Delete the test session

```bash
curl -sS -X DELETE "https://api.closebot.com/bot/$BOT_ID/testSession/$LEAD_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

Confirm with user.

## Live demo alternative

For client-facing demos (white-label compliant, doesn't affect metrics), use the LiveDemo endpoints instead:
```
POST /bot-live-demo/{botId}            ← create demo
POST /bot-live-demo/live/{key}/session ← start a session for a prospect
POST /bot-live-demo/live/{key}/session/{sessionLeadId}/message ← send a message
GET  /bot-live-demo/live/{key}/session/{sessionLeadId}/stream  ← stream replies (SSE)
```

See [`../endpoints/livedemo.md`](../endpoints/livedemo.md).
