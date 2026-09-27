# BotTemplate — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  1 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /botTemplates`

**Tag:** BotTemplate · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List templates

**Responses:**
- `200` — OK → `BotTemplateDto`

**Example:**
```bash
curl "https://api.closebot.com/botTemplates" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---
