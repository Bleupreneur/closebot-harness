# Notification — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  5 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /notifications`

**Tag:** Notification · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List notifications

**Responses:**
- `default` — Error → `NotificationDto`

**Example:**
```bash
curl "https://api.closebot.com/notifications" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /notifications/forwarding`

**Tag:** Notification · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get notification forwarding settings

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/notifications/forwarding" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /notifications/forwarding`

**Tag:** Notification · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update notification forwarding settings

**Request body:** [`NotificationForwardingDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK
- `401` — Unauthorized → `ProblemDetails`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/notifications/forwarding" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /notifications/{id}`

**Tag:** Notification · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete a notification

**Path params:**
- `id` (string, required)

**Responses:**
- `default` — Error → `NotificationDto`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/notifications/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /notifications/{id}`

**Tag:** Notification · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a notification

**Path params:**
- `id` (string, required) — The ID of the notification to update.

**Request body:** [`NotificationUpdateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `default` — Error → `NotificationDto`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/notifications/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
