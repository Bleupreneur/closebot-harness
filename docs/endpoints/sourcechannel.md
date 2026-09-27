# SourceChannel — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  5 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /agency/source/{sourceId}/custom-channels`

**Tag:** SourceChannel · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `sourceId` (string, required)

**Responses:**
- `200` — OK → `AgencySourceChannelDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<sourceId>/custom-channels" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /agency/source/{sourceId}/custom-channels`

**Tag:** SourceChannel · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `sourceId` (string, required)

**Request body:** [`CreateSourceChannelInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `AgencySourceChannelDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/agency/source/<sourceId>/custom-channels" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /agency/source/{sourceId}/custom-channels/{channelId}`

**Tag:** SourceChannel · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `sourceId` (string, required)
- `channelId` (string, required)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/agency/source/<sourceId>/custom-channels/<channelId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/source/{sourceId}/custom-channels/{channelId}`

**Tag:** SourceChannel · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `sourceId` (string, required)
- `channelId` (string, required)

**Responses:**
- `200` — OK → `AgencySourceChannelDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<sourceId>/custom-channels/<channelId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /agency/source/{sourceId}/custom-channels/{channelId}`

**Tag:** SourceChannel · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `sourceId` (string, required)
- `channelId` (string, required)

**Request body:** [`UpdateSourceChannelInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `AgencySourceChannelDto`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/agency/source/<sourceId>/custom-channels/<channelId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
