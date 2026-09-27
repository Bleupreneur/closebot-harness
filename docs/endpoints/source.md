# Source — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  15 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /agency/source`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List sources

Retrieves sources within the current agency.

**Query params:**
- `pageSize` (integer, optional) — Size of each page (max 100)
- `page` (integer, optional) — The page number. For example, page 5 with page size of 20 would start at offset 100.
- `query` (string, optional) — Search by source name
- `category` (string, optional) — Search by only specific categories (GHL, HubSpot, WebHook, etc)
- `order` (string, optional) — How results should be ordered. "+" or "-" prefix to specific ascending or descending.
- `forceTokenRefresh` (boolean, optional) — When true, access token for all returned sources are refreshed.

**Responses:**
- `200` — OK → `SourceDtoPaginated`

**Example:**
```bash
curl "https://api.closebot.com/agency/source" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /agency/source`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Add a source

**Request body:** [`AddSourceInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `SourceDto`
- `400` — Bad Request

**Example:**
```bash
curl -X POST "https://api.closebot.com/agency/source" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /agency/source/{id}`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete a source

Deletes a source and all associated information from Closebot.

Also attempts to uninstall the Closebot app from the external CRM.

**Path params:**
- `id` (string, required) — The source ID.

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/agency/source/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/source/{id}`

**Tag:** Source · **OperationId:** `Get a source` · **Auth:** `X-CB-KEY`

**Summary:** Get a source

Retrieves information for a single source.

**Path params:**
- `id` (string, required) — The source ID

**Responses:**
- `200` — OK → `SourceDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/source/{id}/calendars`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List source calendars

Lists all calendars attached to a source.

This will return both manually added calendars and calendars from the external CRM.

**Path params:**
- `id` (string, required) — The source ID.

**Responses:**
- `200` — OK → `SourceCalendarDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<id>/calendars" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/source/{id}/channels`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List source channels

Lists all channels available to a source.

**Path params:**
- `id` (string, required) — The source ID.

**Responses:**
- `200` — OK → `SourceChannelDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<id>/channels" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/source/{id}/fields`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List source fields

**Path params:**
- `id` (string, required) — The source ID.

**Responses:**
- `200` — OK → `SourceFieldCollectionDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<id>/fields" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/source/{id}/owners`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List HubSpot owners

Returns the list of HubSpot users (owners) available as message senders for a HubSpot source.
Returns an empty list for non-HubSpot sources.

**Path params:**
- `id` (string, required) — The source ID.

**Responses:**
- `200` — OK → `SourceOwnerDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<id>/owners" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/source/{id}/tags`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List source tags

**Path params:**
- `id` (string, required) — The source ID.

**Responses:**
- `200` — OK → `SourceTagDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<id>/tags" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /agency/source/{sourceId}`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a source

Updates fields in a source.

Only non-null fields are updated. Any missing or null field is ignored.

**Path params:**
- `sourceId` (string, required) — The source ID.

**Request body:** [`UpdateSourceInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `SourceDto`
- `400` — Bad Request

**Example:**
```bash
curl -X PUT "https://api.closebot.com/agency/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /agency/source/{sourceId}/webhook-integration`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get the webhook integration configuration for a source

Returns the setup wizard configuration. The external API key itself is
never returned, only whether one is saved.

**Path params:**
- `sourceId` (string, required) — The source ID.

**Responses:**
- `200` — OK → `WebhookIntegrationDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<sourceId>/webhook-integration" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /agency/source/{sourceId}/webhook-integration/contact-fetch`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Save the contact fetch configuration

Saves the optional request executed on inbound messages to fetch
contact details (typically a GET with {{contactId}}), plus the mapping
of contact field descriptors to JSON paths within its response body.
Passing a null template disables contact fetching.

**Path params:**
- `sourceId` (string, required) — The source ID.

**Request body:** [`SaveWebhookContactFetchInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `WebhookIntegrationDto`
- `400` — Bad Request

**Example:**
```bash
curl -X PUT "https://api.closebot.com/agency/source/<sourceId>/webhook-integration/contact-fetch" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /agency/source/{sourceId}/webhook-integration/events`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List captured webhook events

Returns up to 3 events captured while the source was in listen mode,
newest first. The setup wizard polls this endpoint.

**Path params:**
- `sourceId` (string, required) — The source ID.

**Responses:**
- `200` — OK → `CapturedWebhookEventsResult`

**Example:**
```bash
curl "https://api.closebot.com/agency/source/<sourceId>/webhook-integration/events" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /agency/source/{sourceId}/webhook-integration/inbound`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Save the inbound webhook mapping

Saves the JSON path mapping, filter key and token requirement.
Passing a null mapping reverts inbound processing to the legacy packet
format (kind/contactId/body).

**Path params:**
- `sourceId` (string, required) — The source ID.

**Request body:** [`SaveWebhookInboundInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `WebhookIntegrationDto`
- `400` — Bad Request

**Example:**
```bash
curl -X PUT "https://api.closebot.com/agency/source/<sourceId>/webhook-integration/inbound" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `PUT /agency/source/{sourceId}/webhook-integration/outbound`

**Tag:** Source · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Save the outbound webhook configuration

Mode "legacy" POSTs bot events to the callback URL; mode "templates"
executes the saved HTTP request templates directly against the external
API. For the external API key: null leaves it unchanged, an empty
string clears it.

**Path params:**
- `sourceId` (string, required) — The source ID.

**Request body:** [`SaveWebhookOutboundInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `WebhookIntegrationDto`
- `400` — Bad Request

**Example:**
```bash
curl -X PUT "https://api.closebot.com/agency/source/<sourceId>/webhook-integration/outbound" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
