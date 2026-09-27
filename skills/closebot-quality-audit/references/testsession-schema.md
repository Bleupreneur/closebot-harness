# CloseBot testSession API Schema

Complete reference for Path A testing via CloseBot's testSession API.

## Endpoints

### Create Test Session
```http
POST /bot/{botId}/testSession
```

**Request:** None (empty body)

**Response:**
```json
{
  "leadId": "lead_test_XXXXXXXXXXXXXXXX",
  "sourceId": "src_test_XXXXXXXXXXXXXXXX"
}
```

### Send Message
```http
POST /bot/{botId}/testSession/message
Content-Type: application/json

{
  "leadId": "lead_test_XXXXXXXXXXXXXXXX",
  "message": "What services do you offer?"
}
```

**Response:** Empty body (200 OK) — response comes via SSE

### Poll SSE Stream
```http
GET /bot/{botId}/testSession/messages/{leadId}
```

**Response:** Server-Sent Events stream

```
data: {"type": "connected"}

data: {"type":"logs","logs":[...]}

data: {"type":"action","action":{...}}

data: {"type":"thinking_started",...}

data: {"type":"message-sent","message":"Bot response text here","sender":"bot",...}

data: {"type":"bot_done",...}
```

### Cleanup
```http
DELETE /bot/{botId}/testSession/{leadId}
```

## SSE Event Types

| Event Type | When | Payload |
|------------|------|---------|
| `connected` | Stream opens | `{}` |
| `logs` | Bot processing | Array of log entries with prompts, model calls |
| `action` | Node transition | `actionId`, `nodeId`, `leadId` |
| `thinking_started` | LLM begins | Timestamp |
| `message-sent` | **Bot replies** | `message`, `sender`, timestamps |
| `bot_done` | Conversation ends | Final state |

## Critical Parsing Pattern

The bot reply is in `type: message-sent` events:

```python
for line in sse_stream.split('\n'):
    if line.startswith('data:'):
        try:
            event = json.loads(line.replace('data:', '').strip())
            if event.get('type') == 'message-sent':
                bot_reply = event['message']
                print(f"Bot: {bot_reply}")
        except json.JSONDecodeError:
            pass
```

## Python Test Pattern

```python
import os
import subprocess
import json
import time

# Load API key: env var first, then <repo>/.env
cb_key = os.environ.get('CLOSEBOT_API_KEY', '')
if not cb_key and os.path.exists('.env'):
    with open('.env') as f:
        for line in f:
            if line.startswith('CLOSEBOT_API_KEY='):
                cb_key = line.split('=', 1)[1].strip().strip('"')

# Create session
create = subprocess.run([
    'curl', '-s', '-X', 'POST',
    '-H', f'X-CB-KEY: {cb_key}',
    '-H', 'Content-Type: application/json',
    f'https://api.closebot.com/bot/{BOT_ID}/testSession'
], capture_output=True, text=True)

lead_id = json.loads(create.stdout)['leadId']

# Send message
subprocess.run([
    'curl', '-s', '-X', 'POST',
    '-H', f'X-CB-KEY: {cb_key}',
    '-H', 'Content-Type: application/json',
    '-d', json.dumps({'leadId': lead_id, 'message': 'TEST'}),
    f'https://api.closebot.com/bot/{BOT_ID}/testSession/message'
], capture_output=True)

# Poll SSE
time.sleep(3)
sse = subprocess.run([
    'curl', '-s', '-N', '--max-time', '20',
    '-H', f'X-CB-KEY: {cb_key}',
    f'https://api.closebot.com/bot/{BOT_ID}/testSession/messages/{lead_id}'
], capture_output=True, text=True)

# Parse response
for line in sse.stdout.split('\n'):
    if 'data:' in line and 'message-sent' in line:
        event = json.loads(line.replace('data:', '').strip())
        if event.get('type') == 'message-sent':
            print(f"Bot: {event['message']}")

# Cleanup
subprocess.run([
    'curl', '-s', '-X', 'DELETE',
    '-H', f'X-CB-KEY: {cb_key}',
    f'https://api.closebot.com/bot/{BOT_ID}/testSession/{lead_id}'
], capture_output=True)
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | API key missing/invalid | Check `CLOSEBOT_API_KEY` in your env or `<repo>/.env` |
| `404 Not Found` | Bot ID wrong | Verify bot exists in CloseBot |
| Empty SSE | Persona not assigned | Assign persona in CloseBot UI |
| No `message-sent` | Bot has no source/KB | Attach source or add inline pricing |
| Timeout | Bot slow/stuck | Increase `--max-time` |

## See Also

- Main skill: `/closebot-audit-verification`
- CloseBot API docs: https://closebot.com/docs