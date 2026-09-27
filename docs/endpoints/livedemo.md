# LiveDemo — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  10 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /bot-live-demo/live/{key}`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get Live Demo

**Path params:**
- `key` (string, required) — The key of the demo

**Responses:**
- `200` — OK → `LiveDemoDto`

**Example:**
```bash
curl "https://api.closebot.com/bot-live-demo/live/<key>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot-live-demo/live/{key}/session`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create Live Demo Session

**Path params:**
- `key` (string, required) — The key of the demo

**Responses:**
- `200` — OK → `LiveDemoSessionDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot-live-demo/live/<key>/session" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `GET /bot-live-demo/live/{key}/session/{sessionLeadId}`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get Live Demo Lead

**Path params:**
- `key` (string, required) — The key of the demo
- `sessionLeadId` (string, required) — The session lead ID

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/bot-live-demo/live/<key>/session/<sessionLeadId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /bot-live-demo/live/{key}/session/{sessionLeadId}`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update Live Demo Fields

**Path params:**
- `key` (string, required) — The key of the demo
- `sessionLeadId` (string, required) — The session lead ID

**Request body:** [`LeadUpdateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X PUT "https://api.closebot.com/bot-live-demo/live/<key>/session/<sessionLeadId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /bot-live-demo/live/{key}/session/{sessionLeadId}/message`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Stream Live Demo Messages

**Path params:**
- `key` (string, required) — The key of the demo
- `sessionLeadId` (string, required) — The session lead ID

**Request body:** [`LiveDemoMessageInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot-live-demo/live/<key>/session/<sessionLeadId>/message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /bot-live-demo/live/{key}/session/{sessionLeadId}/stream`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Stream Live Demo Messages

**Path params:**
- `key` (string, required) — The key of the demo
- `sessionLeadId` (string, required) — The session lead ID

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/bot-live-demo/live/<key>/session/<sessionLeadId>/stream" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /bot-live-demo/{botId}`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List Live Demos

**Path params:**
- `botId` (string, required) — The ID of the Bot

**Responses:**
- `200` — OK → `LiveDemoDto`

**Example:**
```bash
curl "https://api.closebot.com/bot-live-demo/<botId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot-live-demo/{botId}`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create Live Demo

**Path params:**
- `botId` (string, required) — The ID of the Bot

**Request body:** [`LiveDemoCreateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `LiveDemoDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot-live-demo/<botId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /bot-live-demo/{botId}/{key}`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete Live Demo

**Path params:**
- `botId` (string, required) — The ID of the Bot
- `key` (string, required) — The key of the live demo

**Responses:**
- `200` — OK → `LiveDemoDto`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/bot-live-demo/<botId>/<key>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /bot-live-demo/{botId}/{key}`

**Tag:** LiveDemo · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update Live Demo

**Path params:**
- `botId` (string, required) — The ID of the Bot
- `key` (string, required) — The key of the live demo

**Request body:** [`LiveDemoCreateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `LiveDemoDto`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/bot-live-demo/<botId>/<key>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
