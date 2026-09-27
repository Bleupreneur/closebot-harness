# Playbook 2 — List bots and inspect one

**Tier 0 (read-safe)**. Discover what's in the agency, then pick one and read its full configuration.

## 1. List bots

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot" | jq '.[] | {id, name}'
```

## 2. Get one bot in full

```bash
BOT_ID="<paste id from step 1>"
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$BOT_ID" | jq .
```

Returns the full `BotDto` — name, version, attached sources, FAQ ids, persona id, tool list.

## 3. Read the published job-flow graph

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$BOT_ID/steps" | jq .
```

Returns every node in the flow with its config — input fields, branches, integrations.

## 4. List all available node types (for graph editing)

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/nodeDescriptors" | jq '.[] | .name'
```

## What you can do next

- Edit and save: `POST /bot/{id}/save` (Tier 1 — see playbook 3)
- Publish the saved version: `POST /bot/{id}/publish` (Tier 2 — see playbook 3)
- Test before publishing: `POST /bot/{botId}/testSession` (see playbook 7)
