# Hierarchy — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  5 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /hierarchy`

**Tag:** Hierarchy · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List folders

**Responses:**
- `200` — OK → `ListHierarchyResult`
- `401` — Unauthorized → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/hierarchy" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /hierarchy`

**Tag:** Hierarchy · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Add a folder

**Request body:** [`AddHierarchyInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `201` — Created → `AddHierarchyOutput`

**Example:**
```bash
curl -X POST "https://api.closebot.com/hierarchy" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /hierarchy/{id}`

**Tag:** Hierarchy · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete a folder

**Path params:**
- `id` (string, required) — The ID of the folder to delete.

**Responses:**
- `200` — OK
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/hierarchy/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /hierarchy/{id}`

**Tag:** Hierarchy · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get a folder

**Path params:**
- `id` (string, required) — The ID of the folder to get.

**Responses:**
- `200` — OK → `ListHierarchyResult`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/hierarchy/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /hierarchy/{id}`

**Tag:** Hierarchy · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a folder

**Path params:**
- `id` (string, required) — The ID of the folder to update.

**Request body:** [`HierarchyInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK
- `401` — Unauthorized → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/hierarchy/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
