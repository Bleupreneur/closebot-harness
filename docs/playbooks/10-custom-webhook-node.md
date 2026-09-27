# Playbook 10 — Configure a Custom Webhook node in a bot

**Tier 1**. Adds a Custom Webhook action to a bot's job-flow graph so the bot calls an external URL mid-conversation. The bot graph itself is edited via `POST /bot/{id}/save` — there is no dedicated webhook endpoint.

## 1. (Tier 0) Inspect node descriptors to find the Custom Webhook node type

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/nodeDescriptors" \
  | jq '.[] | select(.name | test("webhook"; "i"))'
```

The descriptor lists the node's input fields (URL, method, headers, body, sync/async).

## 2. (Tier 0) Get the current bot graph

```bash
BOT_ID="<bot id>"
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$BOT_ID/steps" > /tmp/bot-steps.json
jq '.' /tmp/bot-steps.json | head -50
```

## 3. Edit the graph locally — insert a Custom Webhook node

Open `/tmp/bot-steps.json`, add a new node of type `customWebhook` (exact name from step 1). Required fields (check `schema/node-descriptors.json` and the Custom Webhook node in CloseBot's docs at <https://docs.closebot.com>):

| Field | Notes |
|---|---|
| `url` | destination URL (your endpoint) |
| `method` | `GET` / `POST` / `PUT` / `DELETE` / `PATCH` |
| `query` | `[{name, value}]` |
| `body` | JSON or form-data |
| `headers` | typically auth tokens |
| `waitForResponse` | `true` (sync, default) or `false` (async) |
| `outputs` | declared response fields the agent can use downstream |

Example node fragment:

```json
{
  "type": "customWebhook",
  "id": "webhook-1",
  "config": {
    "url": "https://your-handler.example.com/closebot-callback",
    "method": "POST",
    "headers": [{ "name": "Authorization", "value": "Bearer $YOUR_TOKEN" }],
    "body": { "leadId": "{{lead.id}}", "intent": "{{flow.intent}}" },
    "waitForResponse": true,
    "outputs": ["status", "appointmentId"]
  }
}
```

## 4. (Tier 1) Save the modified graph

```bash
curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/save" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/bot-steps.json
```

## 5. (Tier 1) Test the node before publishing

The CloseBot UI shows a "Test Webhook" button per node — output variables only become available **after** running this test with sample data. Programmatically, use [playbook 7](./07-test-session.md) to drive a conversation that hits the node and verify the response variables are populated.

## 6. (Tier 2) Publish

After confirmed test pass — see [playbook 3 step 6](./03-create-train-publish.md#6-tier-2-publish--stop-confirm-with-the-user-first).

## Notes

- The Custom Webhook node makes CloseBot the **client**; your endpoint is the **server**. There's no inbound-from-CloseBot webhook product.
- No platform-level HMAC signature is documented — implement your own auth via the `headers` field (bearer tokens, custom headers).
- Sync mode pauses the flow; if your endpoint is slow, the contact waits. Use async if the work doesn't need to feed back into the conversation.
