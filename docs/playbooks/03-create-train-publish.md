# Playbook 3 — Create a bot, train it, and publish

Spans Tiers 0 → 1 → 2. The final `publish` step changes **live** behavior — confirm with the user before step 5.

## 1. (Tier 0) List sources to pick one to attach

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/agency/source" | jq '.[] | {id, name}'
SOURCE_ID="<id from output>"
```

## 2. (Tier 1) Create a bot — AI-assisted

```bash
curl -sS -X POST "https://api.closebot.com/bot/ai" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Skin Quiz Lead Qualifier",
    "description": "Qualifies leads from a paid-ads landing page and books a 15-min consult.",
    "industry": "Med Spa",
    "tone": "friendly, professional"
  }' | jq '{id: .id, name: .name}'
BOT_ID="<id from output>"
```

Schema: `AiCreateBotInput`. Inspect via `jq '.components.schemas.AiCreateBotInput' schema/openapi.json` for all fields.

## 3. (Tier 1) Attach a knowledge source

```bash
curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/source/$SOURCE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

## 4. (Tier 1) Save the current draft

```bash
curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/save" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ /* full BotDto with edits */ }'
```

## 5. (Tier 1) Test the bot in a sandbox before publishing

See [playbook 7](./07-test-session.md). Don't skip this on a real account.

## 6. (TIER 2) Publish — STOP, confirm with the user first

```
About to publish bot $BOT_ID to PRODUCTION.
This becomes live for all integrated channels (SMS, chat widget, FB, IG, WhatsApp).
Type "yes publish" to proceed.
```

After explicit confirmation:

```bash
curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/publish" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

## Rollback

If publish was wrong: re-publish a prior version via `PUT /bot/{id}/version/{version}` then `POST /bot/{id}/publish`. Inspect available versions via `GET /bot/{id}` (response includes version history).
