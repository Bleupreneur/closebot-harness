# Playbook 5 — Take a lead off auto-AI (human takeover)

**Tier 1**. Disables the bot for one specific lead so a human can step in. The conversation in the channel continues; just no AI replies.

## 1. (Tier 0) Confirm current state

```bash
LEAD_ID="<lead id>"
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/lead/$LEAD_ID/ai-toggle" | jq .
```

## 2. (Tier 1) Disable AI

```bash
curl -sS -X PUT "https://api.closebot.com/lead/$LEAD_ID/ai-toggle" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false }'
```

## 3. (Tier 1, optional) Have a human send the next message

```bash
curl -sS -X POST "https://api.closebot.com/lead/$LEAD_ID/send-message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Hi, this is Avery jumping in — happy to help directly." }'
```

## 4. (Tier 1) Re-enable AI later

```bash
curl -sS -X PUT "https://api.closebot.com/lead/$LEAD_ID/ai-toggle" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true }'
```

## Tag-based shortcut

Per CloseBot's docs (<https://docs.closebot.com>): any contact tagged **`AI Off`** is permanently filtered out at the source level (system default red filter). Adding/removing this tag via your CRM achieves the same effect without touching the API. See CloseBot's docs on source filters: https://docs.closebot.com/en/articles/11499280-source-filters
