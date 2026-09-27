# Webhook — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  1 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `POST /webhook/event/{sourceId}`

**Tag:** Webhook · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Send a webhook event

**Path params:**
- `sourceId` (string, required) — The ID of the WebHook source.

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/webhook/event/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---
