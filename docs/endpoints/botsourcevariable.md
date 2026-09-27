# BotSourceVariable — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  2 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /botVariables/{botId}/{sourceId}`

**Tag:** BotSourceVariable · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get source variables

**Path params:**
- `botId` (string, required) — The bot ID.
- `sourceId` (string, required) — The source ID.

**Responses:**
- `200` — OK → `BotVariableDto`
- `401` — Unauthorized → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/botVariables/<botId>/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /botVariables/{botId}/{sourceId}`

**Tag:** BotSourceVariable · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a source variable

**Path params:**
- `botId` (string, required) — The bot ID.
- `sourceId` (string, required) — The source ID.

**Request body:** [`BotVariableUpdateInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK
- `400` — Bad Request → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X POST "https://api.closebot.com/botVariables/<botId>/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
