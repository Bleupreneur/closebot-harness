# Bot — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  24 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /bot`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List bots

**Responses:**
- `200` — OK → `BotDto`

**Example:**
```bash
curl "https://api.closebot.com/bot" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create a new bot

**Request body:** [`CreateBotInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `BotDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /bot/ai`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create bot with AI

**Request body:** [`AiCreateBotInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `BotDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/ai" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /bot/bbb/templates`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get bot builder builder templates

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/bot/bbb/templates" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /bot/nodeDescriptors`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get the node descriptors

**Responses:**
- `200` — OK → `NodeInformation`

**Example:**
```bash
curl "https://api.closebot.com/bot/nodeDescriptors" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot/preview-import`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Validate Flow

Preview and validate a KDL import without creating a bot.
Performs structural, referential, and graph integrity checks.

**Request body:** [`PreviewImportInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `PreviewImportResponse`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/preview-import" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /bot/{id}`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete a bot

**Path params:**
- `id` (string, required) — The bot ID.

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/bot/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /bot/{id}`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get a bot

**Path params:**
- `id` (string, required) — The bot ID.

**Responses:**
- `200` — OK → `BotDto`

**Example:**
```bash
curl "https://api.closebot.com/bot/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /bot/{id}`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a bot

Updates fields in a bot.

Only non-null fields are updated. Any missing or null field is ignored.

**Path params:**
- `id` (string, required) — The bot ID.

**Request body:** [`UpdateBotInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `BotDto`
- `400` — Bad Request → `UpdateBotErrorResponse`
- `404` — Not Found → `UpdateBotErrorResponse`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/bot/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /bot/{id}/duplicate`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Duplicate a bot

**Path params:**
- `id` (string, required) — The bot ID.

**Responses:**
- `200` — OK → `BotDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<id>/duplicate" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `GET /bot/{id}/export`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Export a bot

**Path params:**
- `id` (string, required) — The bot ID.

**Query params:**
- `botVersion` (string, optional) — The bot version (x.y.z). If not provided, the latest version is exported.

**Responses:**
- `200` — OK → `ExportBotResponse`

**Example:**
```bash
curl "https://api.closebot.com/bot/<id>/export" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /bot/{id}/persona-performance`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Persona performance for a bot, scoped to a date range or split-test window.

**Path params:**
- `id` (string, required) — The bot ID.

**Query params:**
- `start` (string, optional) — Inclusive start of the performance window.
- `end` (string, optional) — Exclusive end of the performance window.
- `splitTestId` (string, optional) — Optional split-test ID (the bot ID of the 1:1 split test). Uses that

**Responses:**
- `200` — OK → `BotPersonaPerformanceResponseDto`
- `400` — Bad Request → `GetPersonaPerformanceErrorResponse`
- `404` — Not Found → `GetPersonaPerformanceErrorResponse`

**Example:**
```bash
curl "https://api.closebot.com/bot/<id>/persona-performance" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot/{id}/persona-split-test/end`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** End a persona split test

Ends the bot's current persona split test immediately, snapshots
performance results, and promotes the winning persona to the bot default.
Idempotent if the test has already been finalized.

**Path params:**
- `id` (string, required) — The bot ID.

**Responses:**
- `200` — OK → `BotDto`
- `400` — Bad Request → `EndPersonaSplitTestErrorResponse`
- `404` — Not Found → `EndPersonaSplitTestErrorResponse`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<id>/persona-split-test/end" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `GET /bot/{id}/persona-split-tests`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List past persona split tests for a bot

Returns deactivated tests, newest first. The current test — running or
just-ended and still marked active — stays on GET /bot/{id}.

**Path params:**
- `id` (string, required) — The bot ID.

**Query params:**
- `skip` (integer, optional) — Records to skip. Defaults to 0.
- `take` (integer, optional) — Page size, clamped to Closebot.Api.Controllers.BotController.MaxSplitTestPageSize.

**Responses:**
- `200` — OK → `PersonaSplitTestPageDto`

**Example:**
```bash
curl "https://api.closebot.com/bot/<id>/persona-split-tests" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot/{id}/publish`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Publish a bot

**Path params:**
- `id` (string, required) — The bot ID.

**Responses:**
- `200` — OK → `PublishBotResponse`
- `400` — Bad Request → `PublishBotResponse`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<id>/publish" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `POST /bot/{id}/save`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Save a bot

**Path params:**
- `id` (string, required) — The bot ID.

**Request body:** [`SaveBotInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `SaveBotResponse`
- `400` — Bad Request → `SaveBotResponse`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<id>/save" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /bot/{id}/saveTools`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Save bot tools

**Path params:**
- `id` (string, required) — The bot ID.

**Request body:** [`ToolInputDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `BotToolDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<id>/saveTools" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /bot/{id}/source/{sourceId}`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Detach a source from a bot

**Path params:**
- `id` (string, required) — The bot ID.
- `sourceId` (string, required) — The source ID.

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/bot/<id>/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot/{id}/source/{sourceId}`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Attach a source to a bot

**Path params:**
- `id` (string, required) — The bot ID.
- `sourceId` (string, required) — The source ID.

**Request body:** [`AttachSourceInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<id>/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /bot/{id}/source/{sourceId}/mcp-server`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)
- `sourceId` (string, required)

**Query params:**
- `serverUrl` (string, optional)

**Responses:**
- `200` — OK
- `400` — Bad Request → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/bot/<id>/source/<sourceId>/mcp-server" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /bot/{id}/source/{sourceId}/mcp-server`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)
- `sourceId` (string, required)

**Responses:**
- `200` — OK → `BotSourceMcpAuthDto`

**Example:**
```bash
curl "https://api.closebot.com/bot/<id>/source/<sourceId>/mcp-server" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /bot/{id}/source/{sourceId}/mcp-server`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)
- `sourceId` (string, required)

**Request body:** [`BotSourceMcpAuthInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `400` — Bad Request → `ProblemDetails`

**Example:**
```bash
curl -X POST "https://api.closebot.com/bot/<id>/source/<sourceId>/mcp-server" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /bot/{id}/steps`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get steps for a version

**Path params:**
- `id` (string, required) — The bot ID.

**Query params:**
- `botVersion` (string, optional) — The bot version (x.y.z).

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/bot/<id>/steps" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /bot/{id}/version/{version}`

**Tag:** Bot · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a bot version

**Path params:**
- `id` (string, required) — The bot ID.
- `version` (string, required) — The version ID.

**Request body:** [`UpdateVersionInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X PUT "https://api.closebot.com/bot/<id>/version/<version>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
