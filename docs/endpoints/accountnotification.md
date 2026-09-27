# AccountNotification — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  2 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /account-notifications`

**Tag:** AccountNotification · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List the calling account's notifications for the active agency.

**Responses:**
- `default` — Error → `AccountNotificationDto`

**Example:**
```bash
curl "https://api.closebot.com/account-notifications" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /account-notifications/{id}`

**Tag:** AccountNotification · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update one of the calling account's notifications.

**Path params:**
- `id` (string, required)

**Request body:** [`AccountNotificationUpdateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `default` — Error → `AccountNotificationDto`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/account-notifications/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
