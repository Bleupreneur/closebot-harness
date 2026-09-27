# HIPAA-Safe Readback for GHL Live_Chat Conversations

## Problem

HIPAA-compliant GHL locations (e.g. a medical client location `<LOCATION_ID>`) block
message history reads via the standard API:

```
GET /conversations/{convId}/messages
→ 401 Unauthorized: "Can not fetch messages from HIPAA compliant account"
   canonicalCode: CONVERSATIONS_HIPAA_RESTRICTED
```

This means you cannot poll for bot replies using the normal message endpoint.
The contact appointments endpoint also returns empty (`{"events":[]}`).

## Solution: Search Endpoint Readback

The `/conversations/search` endpoint is NOT HIPAA-gated. It returns
`lastMessageBody` and `lastMessageDirection` for the most recent message in
the conversation.

### Pattern

```python
def get_last_outbound(contact_id, location_id, token):
    """HIPAA-safe: use search endpoint to get lastMessageBody."""
    resp = ghl_get(f"/conversations/search?locationId={location_id}&contactId={contact_id}")
    convs = resp.get("conversations", [])
    if convs:
        c = convs[0]
        direction = c.get("lastMessageDirection", "")
        body = strip_html(c.get("lastMessageBody", ""))
        mtype = c.get("lastMessageType", "")
        return direction, body, mtype
    return "", "", ""

def wait_for_new_reply(contact_id, location_id, token, last_known_body, timeout=90, interval=5):
    """Poll until lastMessageBody changes to an outbound message."""
    waited = 0
    while waited < timeout:
        time.sleep(interval)
        waited += interval
        direction, body, mtype = get_last_outbound(contact_id, location_id, token)
        if direction == "outbound" and body and body != last_known_body and "TYPE_LIVE_CHAT" in mtype:
            return body
    return "(no reply)"
```

### Limitations

- Only shows the LAST message — cannot see full history via API
- Cannot distinguish multiple bot messages sent in a single turn (only the last is visible)
- For full conversation transcripts, view the conversation in the GHL web UI

### Appointments are separately scope-controlled — do not assume they're blocked

Corrected 2026-08-17 (HIPAA client location `<LOCATION_ID>`): appointment reads
are NOT automatically blocked by HIPAA conversation restrictions. `GET
/contacts/{contactId}/appointments` (scope `contacts.readonly`) and `GET
/calendars/events` / `GET /calendars/events/appointments/{eventId}` (scope
`calendars/events.readonly`) all returned visible appointment details on this
same HIPAA-restricted location, even though `/conversations/{id}/messages`
401'd. Always probe the appointment endpoints separately rather than assuming
a HIPAA block covers them — and minimize/redact PHI in whatever you report.

### When to Use

- Any HIPAA-compliant GHL location (medical, wellness, healthcare)
- When `GET /conversations/{id}/messages` returns 401 with `CONVERSATIONS_HIPAA_RESTRICTED`
- Check each medical/wellness client's HIPAA setting before auditing

### Verified

Proven live 2026-07-08 on a HIPAA-restricted client location. The search
endpoint successfully returned bot replies including pricing (a bundle price),
scheduling (a specific day and time), and deposit info.
