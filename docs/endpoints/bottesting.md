# BotTesting — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  8 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /bot/{botId}/testSession`

**Tag:** BotTesting · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List test sessions

**Path params:**
- `botId` (string, required) — The bot ID.

**Query params:**
- `offset` (integer, optional) — The offset.
- `maxCount` (integer, optional) — The maximum count.

**Responses:**
- `200` — OK → `ListLeadDto`

**Example:**
```bash
curl "https://api.closebot.com/bot/<botId>/testSession" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot/{botId}/testSession`

**Tag:** BotTesting · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create a test session

**Path params:**
- `botId` (string, required) — The bot ID.

**Responses:**
- `200` — OK → `TestSession`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<botId>/testSession" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `POST /bot/{botId}/testSession/message`

**Tag:** BotTesting · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Send a message to a test session

**Path params:**
- `botId` (string, required) — The bot ID.

**Request body:** [`TestSessionMessageInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<botId>/testSession/message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /bot/{botId}/testSession/messages/{leadId}`

**Tag:** BotTesting · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Listen for messages

**Path params:**
- `botId` (string, required) — The bot ID.
- `leadId` (string, required) — The lead ID.

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/bot/<botId>/testSession/messages/<leadId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `DELETE /bot/{botId}/testSession/{leadId}`

**Tag:** BotTesting · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete a test session

**Path params:**
- `botId` (string, required) — The bot ID.
- `leadId` (string, required) — The lead ID.

**Responses:**
- `200` — OK
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/bot/<botId>/testSession/<leadId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /bot/{botId}/testSession/{leadId}`

**Tag:** BotTesting · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a test session

**Path params:**
- `leadId` (string, required) — The lead ID.
- `botId` (string, required)

**Request body:** [`UpdateSessionInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `UpdateSessionDto`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/bot/<botId>/testSession/<leadId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /bot/{botId}/testSession/{leadId}/force-step`

**Tag:** BotTesting · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Force processing

**Path params:**
- `leadId` (string, required) — The lead ID.
- `botId` (string, required)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<botId>/testSession/<leadId>/force-step" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `POST /bot/{botId}/testSession/{leadId}/rollback`

**Tag:** BotTesting · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Rollback a test session

**Path params:**
- `leadId` (string, required)
- `botId` (string, required)

**Request body:** [`BotTestingRollbackInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `BotTestingRollbackOutput`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<botId>/testSession/<leadId>/rollback" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
