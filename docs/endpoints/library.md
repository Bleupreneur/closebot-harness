# Library — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  19 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /library/external/{provider}/connections`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `provider` (string, required)

**Responses:**
- `200` — OK → `ExternalConnectionDto`

**Example:**
```bash
curl "https://api.closebot.com/library/external/<provider>/connections" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /library/external/{provider}/connections`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `provider` (string, required)

**Request body:** [`ExternalConnectInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `ExternalConnectionDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/library/external/<provider>/connections" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /library/external/{provider}/connections/{connectionId}/connectable-items`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `provider` (string, required)
- `connectionId` (string, required)

**Responses:**
- `200` — OK → `ExternalConnectableItemDto`

**Example:**
```bash
curl "https://api.closebot.com/library/external/<provider>/connections/<connectionId>/connectable-items" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /library/external/{provider}/connections/{connectionId}/resources`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `provider` (string, required)
- `connectionId` (string, required)

**Request body:** [`ExternalSyncInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `ExternalResourceSyncDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/library/external/<provider>/connections/<connectionId>/resources" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /library/external/{provider}/resources`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `provider` (string, required)

**Responses:**
- `200` — OK → `ExternalResourceSyncDto`

**Example:**
```bash
curl "https://api.closebot.com/library/external/<provider>/resources" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `DELETE /library/external/{provider}/resources/{resourceId}`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `provider` (string, required)
- `resourceId` (string, required)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/library/external/<provider>/resources/<resourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /library/external/{provider}/resources/{resourceId}/items`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `provider` (string, required)
- `resourceId` (string, required)

**Responses:**
- `200` — OK → `ExternalResourceItemSyncDto`

**Example:**
```bash
curl "https://api.closebot.com/library/external/<provider>/resources/<resourceId>/items" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /library/files`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List files

**Responses:**
- `200` — OK → `FileDto`

**Example:**
```bash
curl "https://api.closebot.com/library/files" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /library/files`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Upload a file

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/library/files" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `DELETE /library/files/{fileId}`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete a file

**Path params:**
- `fileId` (string, required) — The ID of the file to delete.

**Responses:**
- `200` — OK
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/library/files/<fileId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /library/files/{fileId}`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get a file metadata

**Path params:**
- `fileId` (string, required) — The ID of the file to get.

**Responses:**
- `200` — OK → `FileDto`

**Example:**
```bash
curl "https://api.closebot.com/library/files/<fileId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /library/files/{fileId}`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Replace file content

**Path params:**
- `fileId` (string, required) — The ID of the file to update.

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X PUT "https://api.closebot.com/library/files/<fileId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `GET /library/files/{fileId}/preview`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `fileId` (string, required)

**Responses:**
- `200` — OK → `FilePreviewDto`

**Example:**
```bash
curl "https://api.closebot.com/library/files/<fileId>/preview" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /library/files/{fileId}/scrape-pages`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get the scrape pages for a file

**Path params:**
- `fileId` (string, required) — The ID of the file to get the scrape pages for.

**Responses:**
- `200` — OK → `WebscrapePageDto`

**Example:**
```bash
curl "https://api.closebot.com/library/files/<fileId>/scrape-pages" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /library/files/{fileId}/scrape-pages`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update the scrape pages for a file

**Path params:**
- `fileId` (string, required) — The ID of the file to update the scrape pages for.

**Request body:** [`WebscrapePageUpdateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X PUT "https://api.closebot.com/library/files/<fileId>/scrape-pages" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /library/files/{fileId}/source/{sourceId}`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Detach a file from a source

**Path params:**
- `fileId` (string, required) — The ID of the file to detach.
- `sourceId` (string, required) — The ID of the source to detach the file from.

**Responses:**
- `200` — OK
- `400` — Bad Request → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/library/files/<fileId>/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /library/files/{fileId}/source/{sourceId}`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Attach a file to a source

**Path params:**
- `fileId` (string, required) — The ID of the file to attach.
- `sourceId` (string, required) — The ID of the source to attach the file to.

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/library/files/<fileId>/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json"
```

---

### `GET /library/files/{fileId}/view`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get file content

**Path params:**
- `fileId` (string, required) — The ID of the file to view.

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/library/files/<fileId>/view" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /library/webscrape`

**Tag:** Library · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Create a Web-Scrape file

**Request body:** [`UploadWebscrapeToSourceInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/library/webscrape" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
