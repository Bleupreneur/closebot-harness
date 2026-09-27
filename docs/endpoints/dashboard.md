# Dashboard — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  5 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /dashboard`

**Tag:** Dashboard · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Responses:**
- `200` — OK → `DashboardDto`
- `401` — Unauthorized → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/dashboard" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /dashboard`

**Tag:** Dashboard · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Request body:** [`CreateDashboardInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `201` — Created → `DashboardDto`
- `401` — Unauthorized → `ProblemDetails`
- `403` — Forbidden → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X POST "https://api.closebot.com/dashboard" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /dashboard/{id}`

**Tag:** Dashboard · **OperationId:** `` · **Auth:** `X-CB-KEY`

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
curl -X DELETE "https://api.closebot.com/dashboard/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /dashboard/{id}`

**Tag:** Dashboard · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)

**Responses:**
- `200` — OK → `DashboardDto`
- `401` — Unauthorized → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/dashboard/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /dashboard/{id}`

**Tag:** Dashboard · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `id` (string, required)

**Request body:** [`UpdateDashboardInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `204` — No Content
- `401` — Unauthorized → `ProblemDetails`
- `403` — Forbidden → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/dashboard/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
