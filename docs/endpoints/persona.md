# Persona — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  5 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /persona`

**Tag:** Persona · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List personas

**Responses:**
- `200` — OK → `PersonaDto`

**Example:**
```bash
curl "https://api.closebot.com/persona" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /persona`

**Tag:** Persona · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create a new persona

**Request body:** [`CreatePersonaInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/persona" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /persona/{id}`

**Tag:** Persona · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete a persona

**Path params:**
- `id` (string, required) — The ID of the persona to delete.

**Responses:**
- `204` — No Content
- `400` — Bad Request → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/persona/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /persona/{id}`

**Tag:** Persona · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get a persona

**Path params:**
- `id` (string, required) — The ID of the persona to get.

**Responses:**
- `200` — OK → `PersonaDto`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/persona/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /persona/{id}`

**Tag:** Persona · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a persona

**Path params:**
- `id` (string, required) — The ID of the persona to update.

**Request body:** [`UpdatePersonaInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `PersonaDto`
- `400` — Bad Request → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/persona/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
