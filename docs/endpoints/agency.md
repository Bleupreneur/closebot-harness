# Agency — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  5 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /agency`

**Tag:** Agency · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List agencies

List all agencies the account is a part of.

Currently, CloseBot accounts can only be part of one agency.

**Responses:**
- `200` — OK → `AgencyDto`

**Example:**
```bash
curl "https://api.closebot.com/agency" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/current`

**Tag:** Agency · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get agency

Retrieve the current agency details.
            
Currently, CloseBot accounts can only be part of one agency.

**Responses:**
- `200` — OK → `AgencyDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/current" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `DELETE /agency/invite`

**Tag:** Agency · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Revoke invitation

**Query params:**
- `email` (string, optional) — The invited email to revoke

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/agency/invite" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /agency/invite`

**Tag:** Agency · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Invite users

**Request body:** [`InviteUserInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/agency/invite" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /agency/usage`

**Tag:** Agency · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get usage

**Query params:**
- `scopes` (string, optional) — Comma-separated list of scopes to retrieve. Scopes are: bots, storage, users, responses.

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/agency/usage" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---
