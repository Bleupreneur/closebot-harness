# SmartFAQ — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  5 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /smart-faq`

**Tag:** SmartFAQ · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List FAQs

**Query params:**
- `sourceId` (string, optional) — The source ID of the FAQs.
- `state` (string, optional) — The state of the FAQs. "compressed" or "uncompressed".
- `answered` (string, optional) — The answered status of the FAQs. "answered" or "unanswered".

**Responses:**
- `200` — OK → `SmartFAQDto`

**Example:**
```bash
curl "https://api.closebot.com/smart-faq" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /smart-faq`

**Tag:** SmartFAQ · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create a new FAQ

**Request body:** [`CreateSmartFAQRequest`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `201` — Created

**Example:**
```bash
curl -X POST "https://api.closebot.com/smart-faq" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /smart-faq/answer`

**Tag:** SmartFAQ · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Answer multiple FAQs

**Request body:** [`AnswerMultipleFAQsRequest`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `SmartFAQDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/smart-faq/answer" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /smart-faq/answered-followup`

**Tag:** SmartFAQ · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Follow up on answered FAQs

**Request body:** [`AnsweredFAQFollowUpRequest`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/smart-faq/answered-followup" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /smart-faq/{id}`

**Tag:** SmartFAQ · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete an FAQ

**Path params:**
- `id` (string, required) — The ID of the FAQ to delete.

**Responses:**
- `204` — No Content
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/smart-faq/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---
