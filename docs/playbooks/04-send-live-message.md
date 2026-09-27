# Playbook 4 — Send a live message into a conversation

**Tier 1**. Sends a real reply on a real channel. State intent + confirm `id` resolves to the right contact before calling.

## 1. (Tier 0) Confirm the contact exists

```bash
LEAD_ID="<contact identifier from upstream system, e.g. GHL contact id>"
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/lead/$LEAD_ID" | jq '{id, name, channel}'
```

If 404, abort — the live message endpoint will return `410 No Account`.

## 2. (Tier 1) Send the message

```bash
curl -sS -X POST "https://api.closebot.ai/message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'"$LEAD_ID"'",
    "message": "Hey, just checking in — were you still interested in booking?",
    "channel": "SMS",
    "model": "gpt-4-1106-preview",
    "character_limit": 320
  }'
```

## Status codes (non-standard)

| Code | Meaning | Action |
|---|---|---|
| `200` | OK — body has reply (non-integrated) or empty (integrated, reply went out-of-band) | done |
| `201` | Rerun — another inbound preempted | retry once after 2s |
| `410` | No Account — `id` doesn't resolve | abort |
| `420` | No Credits | run [playbook 8 — refill credits](./08-refill-credits.md) |
| `430` / `440` | Missing `id` / `message` | fix payload |
| `450` | Bot per-contact cap reached | raise `limit` field, or stop |
| `460` | Account-level cap | surface to user |

## Variables you can pass

Full table in [`../06-live-message.md`](../06-live-message.md). Common knobs:
- `bot` — pin a specific bot id (else earliest-created)
- `extra_prompt` — one-shot instruction (≤500 chars)
- `@lead_name`, `@rep_name`, `@<custom>` — variable injection
- `followup: true` — send a follow-up (not a reply)
- `is_update: true` — update bot memory only, no reply

## When NOT to use this endpoint

If the contact is in an integrated GHL source, **don't** drive replies through this endpoint manually unless you intentionally want to bypass GHL conversation routing. Most agencies let GHL deliver inbound → CloseBot → reply via the integration; your code only calls this endpoint when bridging an unintegrated channel.
