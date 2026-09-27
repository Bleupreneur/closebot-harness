# GHL Live_Chat API Patterns for Path B Testing

Concrete API shapes and code patterns for running real Live_Chat
conversations with CloseBot bots through the GHL API. Proven live on a
client bot (bot_XXXXXXXXXXXXXXXX) 2026-07-07.

## Prerequisites

- A GHL PIT token for the client's location (stored as env var
  `<SLUG_UPPER>_PIT`, e.g. `ACME_PIT`, `CLIENT_B_PIT`)
- The client's location id, bot id, and the exact activation trigger
  (the message/tag the GHL automation listens for) — from your own notes
  or `bash scripts/ghl-business-facts.sh <bot_id>` + the GHL workflow
- If your agent runtime redacts secrets in tool output, write the
  token to a temp file first (see "PIT token handling under
  redaction" below)

## Full Workflow

### 1. Create Contact

```python
contact_resp = ghl_call("POST", "/contacts/", {
    "locationId": LOCATION_ID,
    "firstName": "Sarah",
    "lastName": "Mitchell",
    "email": f"lead.test.{int(time.time())}@example.com",
})
contact_id = contact_resp["contact"]["id"]
```

- Response: `{"contact": {"id": "..."}, "traceId": "..."}`
- Do NOT include a phone field — that routes to SMS, not Live_Chat
- Email must be unique per test (use timestamp suffix)

### 2. Create Conversation

```python
conv_resp = ghl_call("POST", "/conversations/", {
    "locationId": LOCATION_ID,
    "contactId": contact_id,
    "type": "Live_Chat",
})
```

- Response: `{"success": true, "conversation": {...}, "traceId": "..."}`
- The conversation ID may come back empty in the top-level response.
  If so, search for it:
  `GET /conversations/search?locationId=X&contactId=Y`
- **CONVERSATION TYPE IS IMMUTABLE**: `PUT /conversations/{id}` with
  `{"type": "..."}` returns 422 "type must be a valid enum value"
  regardless of the value tried. The conversation gets created as
  TYPE_PHONE by default — this does NOT prevent Live_Chat messages
  from working. The message type is separate from the conversation type.

### 3. Send Trigger Message

```python
ghl_call("POST", "/conversations/messages/inbound", {
    "type": "Live_Chat",
    "conversationId": conv_id,
    "message": "FB Form Testing Lip Filler",
})
```

- Response: `{"success": true, "conversationId": "...", "messageId": "...",
  "contactId": "...", "dateAdded": "...", "traceId": "..."}`
- The trigger text must match what the GHL automation listens for
  (check the GHL workflow's trigger for this location)

### 4. Wait for Automation

After sending the trigger message, wait ~15s for the GHL automation to:
1. Create an opportunity (TYPE_ACTIVITY_OPPORTUNITY)
2. Send workflow intro messages (TYPE_LIVE_CHAT, source="workflow")
3. Apply the activation tag (e.g. `ai_setter_testing`)
4. Activate the CloseBot agent on the conversation

Verify the automation fired by checking contact tags:
```python
contact = ghl_call("GET", f"/contacts/{contact_id}")
tags = contact["contact"]["tags"]  # should include activation tag
```

### 5. Poll for Bot Reply

**CRITICAL: Messages response is DOUBLE-NESTED.**

```python
resp = ghl_call("GET", f"/conversations/{conv_id}/messages")
messages = resp["messages"]["messages"]  # NOT resp["messages"]
```

The response shape is:
```json
{
  "messages": {
    "lastMessageId": "...",
    "nextPage": false,
    "messages": [ ...array of message dicts... ]
  },
  "traceId": "..."
}
```

**CRITICAL: Messages are in REVERSE chronological order (newest first).**

To get chronological order, reverse the array:
```python
messages_chronological = list(reversed(messages))
```

### 6. Filter for Bot Text Messages

The conversation contains multiple message types. To get only the bot's
actual text replies, filter on BOTH messageType AND contentType:

```python
bot_texts = [
    m for m in messages
    if m.get("direction") == "outbound"
    and m.get("messageType") == "TYPE_LIVE_CHAT"
    and m.get("contentType") == "text/plain"
    and m.get("source") == "app"  # app = CloseBot, workflow = GHL automation
]
```

Other message types in the conversation:
- `TYPE_ACTIVITY_OPPORTUNITY` — "Opportunity created" events
- `TYPE_ACTIVITY_APPOINTMENT` — Calendar booking events
- `TYPE_LIVE_CHAT` with `source="workflow"` — GHL automation-sent messages
- `TYPE_LIVE_CHAT` with `source="app"` — CloseBot agent messages

### 7. Send Follow-up Messages and Poll

```python
def send_and_wait(message, timeout=90, poll_interval=5):
    # Get baseline message IDs
    baseline = get_messages()
    baseline_ids = {m["id"] for m in baseline}
    
    # Send inbound message
    ghl_call("POST", "/conversations/messages/inbound", {
        "type": "Live_Chat",
        "conversationId": conv_id,
        "message": message,
    })
    
    # Poll for new outbound text message
    waited = 0
    while waited < timeout:
        time.sleep(poll_interval)
        waited += poll_interval
        msgs = get_messages()
        new = [m for m in msgs
               if m.get("id") not in baseline_ids
               and m.get("direction") == "outbound"
               and m.get("messageType") == "TYPE_LIVE_CHAT"
               and m.get("contentType") == "text/plain"]
        if new:
            return strip_html(new[-1]["body"])
    return None
```

Note: bot may send multiple messages in response to one inbound
(e.g. two separate TYPE_LIVE_CHAT messages). Take the last one.

### 8. HTML Stripping

Bot messages come with HTML wrapper:
```
<p style="margin:0px; padding-left: 0px!important;">message text</p>
```

Strip with: `re.sub(r'<[^>]+>', '', body).strip()`

## bash 3.2 Compatibility (macOS)

macOS ships bash 3.2, which does NOT support `${var^^}` (uppercase
parameter expansion). Use `tr` instead:

```bash
# BAD (bash 4+ only):
PIT_VAR="${CLIENT^^}_PIT"
PIT_VAR=${PIT_VAR//-/_}

# GOOD (bash 3.2 safe):
PIT_VAR=$(echo "${CLIENT}_PIT" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
```

## Wrapping it in a script (not shipped)

No live-chat script ships with this repo. If you run Path B often, wrap
steps 1–5 above in your own script: contact creation, conversation setup,
trigger sending, automation wait, and turn-by-turn polling, with a
`--trigger "<activation text>"` argument plus the follow-up turns. Do NOT
delete the contact afterwards (real conversation, real booking).

## What the Bot Does (observed live 2026-07-07)

1. GHL automation sends 2 workflow messages:
   - Booking link message: "Hi <first name>, we got your request..."
   - Engaging question: "Hey <first name>! My name is <PersonaName>..."
2. CloseBot agent takes over for the actual conversation
3. Bot asks about goals → discusses pricing → offers calendar slots
4. Bot creates the appointment in the calendar (TYPE_ACTIVITY_APPOINTMENT)
5. Bot may defer deposit collection to human team

## Do NOT Delete Test Contacts from Path B

Unlike Path A (testSession sandbox, auto-cleaned), Path B creates real
contacts with real bookings. These are real conversations in the
client's GHL account. Only delete if the user explicitly asks.

## Parallel Batch Conversations (proven 2026-07-07, 10 live convos)

To run N live conversations in parallel, use a thread pool with 2 waves of 5
(GHL rate-limit safe). Each thread runs the full flow independently: create
contact → create conversation → send trigger → wait 20s for automation →
poll for reply → send follow-ups → save transcript.

```python
import concurrent.futures

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as exe:
    futures = {exe.submit(run_conversation, i, PERSONAS[i]): i for i in range(5)}
    for future in concurrent.futures.as_completed(futures):
        result = future.result()  # returns transcript dict
# Pause 15s between waves, then run personas 5-9 the same way
```

- Stagger wave 2 by 15s to avoid rate limits.
- Each thread writes its own transcript file (no shared state).
- 10 conversations complete in ~5 min wall time vs ~60 min sequential.
- `run_conversation()` is your own wrapper around steps 1–5 (not shipped).

**Long conversations can exceed a single tool call's timeout.** 6+ turns at
~30-90s per bot reply can exceed a 5-minute execution cap. Run the script in
the background and poll for completion, or break the conversation into
chunks, rather than blocking one call on the whole transcript.

## PIT token handling under redaction

Some agent runtimes scan tool output for API-key-like strings
and mask them before they reach the conversation — passing a location's PIT
token through a shell string gets it corrupted mid-flight, producing a false
401. Workaround: write the token to a temp file first, then read it back
inside the subprocess that calls the GHL API, rather than interpolating it
directly into a shell command.
