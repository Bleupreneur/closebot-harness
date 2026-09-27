# BotMetric — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  12 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

**Removed upstream:**
- `GET /botMetric/leaderboard` — gone from the live spec; use [`GET /leaderboard/board`](leaderboard.md) (see also `/leaderboard/metrics`, `/leaderboard/profile`)
- `GET /botMetric/localleaderboard` — gone from the live spec; use [`GET /leaderboard/board`](leaderboard.md) (see also `/leaderboard/metrics`, `/leaderboard/profile`)

---

### `GET /botMetric/actionCount`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get action count

**Query params:**
- `leadId` (string, optional) — Optional lead ID.
- `sourceId` (string, optional) — Optional source ID.
- `botId` (string, optional) — Optional bot ID.
- `start` (string, optional) — Optional start date.
- `end` (string, optional) — Optional end date.

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/botMetric/actionCount" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/actions`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get actions

**Query params:**
- `leadId` (string, optional) — Optional lead ID.
- `sourceId` (string, optional) — Optional source ID.
- `botId` (string, optional) — Optional bot ID.
- `start` (string, optional) — Optional start date.
- `end` (string, optional) — Optional end date.
- `maxCount` (integer, optional) — Optional maximum number of actions to return.

**Responses:**
- `200` — OK → `BotMetricAction`

**Example:**
```bash
curl "https://api.closebot.com/botMetric/actions" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/agencyMetric`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get agency metric

**Query params:**
- `metric` (string, optional) — The metric to get. Valid options: responses, bookings, activeSources, contacts, totalStorage, revenue.
- `start` (string, optional) — The start date.
- `end` (string, optional) — The end date.
- `resolution` (string, optional) — The resolution.
- `sourceId` (string, optional) — Optional source ID.

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/botMetric/agencyMetric" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/agencySummary`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get agency summary

**Query params:**
- `sourceId` (string, optional) — Optional source ID.

**Responses:**
- `200` — OK → `AgencyDashboardSummaryResponse`

**Example:**
```bash
curl "https://api.closebot.com/botMetric/agencySummary" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/bookingGraph`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get booking graph

**Query params:**
- `start` (string, optional) — The start date.
- `end` (string, optional) — The end date.
- `resolution` (string, optional) — The resolution. Valid options are hourly, daily, or monthly.
- `sourceId` (string, optional) — Optional source ID.

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/botMetric/bookingGraph" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/logs`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get logs

**Query params:**
- `botId` (string, optional) — Optional bot ID.
- `messageId` (string, optional) — Optional message ID.
- `sourceId` (string, optional) — Optional source ID.
- `leadId` (string, optional) — Optional lead ID.
- `actionId` (string, optional) — Optional action ID.
- `start` (string, optional) — Optional start date.
- `end` (string, optional) — Optional end date.
- `maxCount` (integer, optional) — Optional maximum number of logs to return.

**Responses:**
- `200` — OK → `BotMetricLog`

**Example:**
```bash
curl "https://api.closebot.com/botMetric/logs" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/messageCount`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get message count

**Query params:**
- `sourceId` (string, optional) — Optional source ID.
- `leadId` (string, optional) — Optional lead ID.
- `start` (string, optional) — Optional start date.
- `end` (string, optional) — Optional end date.

**Responses:**
- `200` — OK

**Example:**
```bash
curl "https://api.closebot.com/botMetric/messageCount" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/messageFeedback`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get messages with feedback

**Query params:**
- `leadId` (string, optional) — The lead ID.

**Responses:**
- `200` — OK → `MessageFeedbackResponse`

**Example:**
```bash
curl "https://api.closebot.com/botMetric/messageFeedback" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /botMetric/messageFeedback`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Save message feedback

**Request body:** [`MessageFeedbackRequest`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/botMetric/messageFeedback" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /botMetric/messageLikes`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get messages with likes

**Query params:**
- `leadId` (string, optional) — The lead ID.

**Responses:**
- `200` — OK → `MessageLikesResponse`

**Example:**
```bash
curl "https://api.closebot.com/botMetric/messageLikes" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/messageReason`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get message feedback reason

**Query params:**
- `messageId` (string, optional) — The message ID.

**Responses:**
- `200` — OK → `MessageReason`

**Example:**
```bash
curl "https://api.closebot.com/botMetric/messageReason" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /botMetric/messages`

**Tag:** BotMetric · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get messages

**Query params:**
- `sourceId` (string, optional) — Optional source ID.
- `leadId` (string, optional) — Optional lead ID.
- `start` (string, optional) — Optional start date.
- `end` (string, optional) — Optional end date.
- `maxCount` (integer, optional) — Optional maximum number of messages to return.

**Responses:**
- `200` — OK → `BotMetricMessage`

**Example:**
```bash
curl "https://api.closebot.com/botMetric/messages" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---
