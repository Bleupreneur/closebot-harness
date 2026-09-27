# Report — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  8 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /report`

**Tag:** Report · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Responses:**
- `200` — OK → `ReportDto`
- `401` — Unauthorized → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/report" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /report`

**Tag:** Report · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Request body:** [`CreateReportInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `201` — Created → `ReportDto`
- `401` — Unauthorized → `ProblemDetails`

**Example:**
```bash
curl -X POST "https://api.closebot.com/report" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /report/{id}`

**Tag:** Report · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)

**Responses:**
- `200` — OK
- `401` — Unauthorized → `ProblemDetails`
- `403` — Forbidden → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/report/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /report/{id}`

**Tag:** Report · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)

**Request body:** [`UpdateReportInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `204` — No Content
- `401` — Unauthorized → `ProblemDetails`
- `403` — Forbidden → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/report/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /report/{id}/shares`

**Tag:** Report · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)

**Responses:**
- `200` — OK → `ReportShareDto`
- `401` — Unauthorized → `ProblemDetails`
- `403` — Forbidden → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/report/<id>/shares" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /report/{id}/shares`

**Tag:** Report · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)

**Request body:** [`ReportSharesInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `ReportShareDto`
- `400` — Bad Request → `ProblemDetails`
- `401` — Unauthorized → `ProblemDetails`
- `403` — Forbidden → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X POST "https://api.closebot.com/report/<id>/shares" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `PUT /report/{id}/shares`

**Tag:** Report · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)

**Request body:** [`ReportSharesInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `ReportShareDto`
- `400` — Bad Request → `ProblemDetails`
- `401` — Unauthorized → `ProblemDetails`
- `403` — Forbidden → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/report/<id>/shares" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /report/{id}/shares/{accountId}`

**Tag:** Report · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)
- `accountId` (string, required)

**Responses:**
- `204` — No Content
- `401` — Unauthorized → `ProblemDetails`
- `403` — Forbidden → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/report/<id>/shares/<accountId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---
