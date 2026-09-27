# Lead — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  19 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /lead`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List leads

**Query params:**
- `page` (integer, optional) — The page number.
- `pageSize` (integer, optional) — The page size.
- `sourceId` (string, optional) — The source ID.
- `leadId` (string, optional) — The lead ID.

**Responses:**
- `200` — OK → `LeadListResultDto`

**Example:**
```bash
curl "https://api.closebot.com/lead" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /lead/search`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Search leads

**Request body:** [`SearchQueryInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `SearchLeadResultDto`
- `401` — Unauthorized → `ProblemDetails`

**Example:**
```bash
curl -X POST "https://api.closebot.com/lead/search" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /lead/{leadId}`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete a lead

**Path params:**
- `leadId` (string, required) — The ID of the lead to delete.

**Responses:**
- `200` — OK
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/lead/<leadId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /lead/{leadId}`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get a lead

**Path params:**
- `leadId` (string, required) — The ID of the lead to get.

**Query params:**
- `includeExternal` (boolean, optional) — Include external fields of the lead in the result (fields from the CRM).

**Responses:**
- `200` — OK → `LeadDto`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/lead/<leadId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /lead/{leadId}`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update lead fields

**Path params:**
- `leadId` (string, required) — The ID of the lead to update.

**Request body:** [`LeadUpdateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X PUT "https://api.closebot.com/lead/<leadId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /lead/{leadId}/ai-toggle`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `leadId` (string, required)

**Responses:**
- `200` — OK → `LeadAiToggleDto`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/lead/<leadId>/ai-toggle" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /lead/{leadId}/ai-toggle`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `leadId` (string, required)

**Request body:** [`LeadAiToggleUpdateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `LeadAiToggleDto`
- `400` — Bad Request → `ProblemDetails`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/lead/<leadId>/ai-toggle" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `PUT /lead/{leadId}/instance/{botId}`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a lead instance

**Path params:**
- `leadId` (string, required) — The ID of the lead to update.
- `botId` (string, required) — The ID of the bot to update.

**Request body:** [`InstanceUpdateDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X PUT "https://api.closebot.com/lead/<leadId>/instance/<botId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /lead/{leadId}/note`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Leave an internal note on a conversation. Notes are not messages: they
are never sent to the contact and are only included in the AI's context
when marked AiVisible.

**Path params:**
- `leadId` (string, required)

**Request body:** [`CreateNoteInputDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `NoteResultDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/lead/<leadId>/note" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /lead/{leadId}/note/{noteId}`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete an internal note. Only the note's author may delete it.

**Path params:**
- `leadId` (string, required)
- `noteId` (string, required)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/lead/<leadId>/note/<noteId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PATCH /lead/{leadId}/note/{noteId}`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update an internal note's body and/or AI visibility.

**Path params:**
- `leadId` (string, required)
- `noteId` (string, required)

**Request body:** [`UpdateNoteInputDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `NoteResultDto`

**Example:**
```bash
curl -X PATCH "https://api.closebot.com/lead/<leadId>/note/<noteId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /lead/{leadId}/page-history`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Path params:**
- `leadId` (string, required)

**Query params:**
- `limit` (integer, optional)

**Responses:**
- `200` — OK → `LeadHistoryEventDto`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/lead/<leadId>/page-history" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /lead/{leadId}/scheduled-message`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List a lead's scheduled messages: everything pending, plus recent
failures so they stay visible in the conversation.

**Path params:**
- `leadId` (string, required)

**Responses:**
- `200` — OK → `ScheduledMessageDto`

**Example:**
```bash
curl "https://api.closebot.com/lead/<leadId>/scheduled-message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /lead/{leadId}/scheduled-message`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Schedule a message to a lead for a future time — either a manually
typed message or one generated at send time by the conversation's
last-responding AI agent.

**Path params:**
- `leadId` (string, required)

**Request body:** [`CreateScheduledMessageInputDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `ScheduledMessageDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/lead/<leadId>/scheduled-message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /lead/{leadId}/scheduled-message/{scheduledMessageId}`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Cancel a pending scheduled message, or dismiss a failed one. Creator
or team members only. The row is kept (status "canceled") for
auditability; a dismissed failure keeps its original StatusReason.

**Path params:**
- `leadId` (string, required)
- `scheduledMessageId` (string, required)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/lead/<leadId>/scheduled-message/<scheduledMessageId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PATCH /lead/{leadId}/scheduled-message/{scheduledMessageId}`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update a pending scheduled message's time, body (manual only), or
cancel-on-reply flag. Creator or team members only.

**Path params:**
- `leadId` (string, required)
- `scheduledMessageId` (string, required)

**Request body:** [`UpdateScheduledMessageInputDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `ScheduledMessageDto`

**Example:**
```bash
curl -X PATCH "https://api.closebot.com/lead/<leadId>/scheduled-message/<scheduledMessageId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /lead/{leadId}/send-message`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Send a message to a lead

**Path params:**
- `leadId` (string, required)

**Request body:** [`SendMessageInputDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `SendMessageResultDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/lead/<leadId>/send-message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /lead/{leadId}/topics`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** The topics a lead's conversation has been classified into.

Unpaginated, no limit: the taxonomy is capped at 30 Active topics per agency
(see the remark on /analytics/topics/options), and LeadTopics is unique on
(LeadId, TopicId), so a lead's list is bounded well under any page size.
            
Deliberately not gated on the analytics add-on, unlike /analytics/topics.
The contact card's Topics tab is shown to every agency, so this stays on the
ordinary AgencyUser policy inherited from the controller.
            
For the same reason org:client is *narrowed* to its own sources rather than
rejected outright the way the analytics endpoints reject it: a client who can
open the conversation should see what it was about.

**Path params:**
- `leadId` (string, required)

**Responses:**
- `200` — OK → `LeadTopicDto`
- `404` — Not Found → `ProblemDetails`

**Example:**
```bash
curl "https://api.closebot.com/lead/<leadId>/topics" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /lead/{leadId}/typing`

**Tag:** Lead · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Broadcast human typing state to live subscribers for a lead.

**Path params:**
- `leadId` (string, required)

**Request body:** [`LeadTypingInputDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `204` — No Content

**Example:**
```bash
curl -X POST "https://api.closebot.com/lead/<leadId>/typing" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
