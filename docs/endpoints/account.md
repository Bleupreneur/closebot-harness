# Account — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  3 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /account/apiKey`

**Tag:** Account · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List API keys

**Responses:**
- `200` — OK → `ApiKeyDTO`

**Example:**
```bash
curl "https://api.closebot.com/account/apiKey" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /account/apiKey`

**Tag:** Account · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create API Key

Creates a new API key.

**Request body:** [`CreateApiKeyInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `CreateApiKeyOutput`

**Example:**
```bash
curl -X POST "https://api.closebot.com/account/apiKey" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /account/apiKey/{keyId}`

**Tag:** Account · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete API Key

Deletes an API key.

**Path params:**
- `keyId` (string, required) — The key ID.

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/account/apiKey/<keyId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---
