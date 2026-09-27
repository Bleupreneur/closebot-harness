# Analytics — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  6 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /analytics/dimensions/{dimension}/values`

**Tag:** Analytics · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List dimension values available for a given dimension.

**Path params:**
- `dimension` (string, required) — One of channel, bot, persona, detail1, detail2.

**Query params:**
- `metric` (string, optional) — Required for detail1/detail2 — their meaning depends on the metric.

**Responses:**
- `200` — OK → `AnalyticsDimensionValueDto`

**Example:**
```bash
curl "https://api.closebot.com/analytics/dimensions/<dimension>/values" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /analytics/metrics`

**Tag:** Analytics · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List all metrics available.

**Responses:**
- `200` — OK → `AnalyticsMetricDto`

**Example:**
```bash
curl "https://api.closebot.com/analytics/metrics" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /analytics/query`

**Tag:** Analytics · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Run an analytics query for the active agency.

**Request body:** [`AnalyticsQueryRequest`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `AnalyticsQueryResponse`

**Example:**
```bash
curl -X POST "https://api.closebot.com/analytics/query" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /analytics/source-timezones`

**Tag:** Analytics · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Time zones configured on the agency's sources, used to pick a sensible default for
time-of-day analytics (see the hourOfWeek resolution on POST /analytics/query).

**Query params:**
- `sourceIds` (array, optional)

**Responses:**
- `200` — OK → `AnalyticsSourceTimeZonesResponse`

**Example:**
```bash
curl "https://api.closebot.com/analytics/source-timezones" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /analytics/topics`

**Tag:** Analytics · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Topic treemap and per-topic daily series for the active agency.

A dedicated endpoint rather than another metric on /analytics/query, for three reasons:
AnalyticsQueryPoint.Value is an int and average sentiment is a nullable double; the treemap
and its sparklines must come from one snapshot or a batch landing mid-request can make the
rectangles disagree with the trend lines; and Query's validator hard-requires 15-minute
alignment while topics are day-grained.

**Request body:** [`TopicsQueryRequest`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `TopicsQueryResponse`
- `403` — Forbidden → `ProblemDetails`

**Example:**
```bash
curl -X POST "https://api.closebot.com/analytics/topics" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /analytics/topics/options`

**Tag:** Analytics · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Topics available as a conversations filter, optionally scoped to a set of sources.

One rule covers both cases: a topic is listed when it has at least one LeadTopic row in
scope. That deliberately carries no Status predicate. Only Active slugs ever enter the
classifier enum (TopicClassificationPrompt) and the collector refuses to write a fact row
for a non-Active topic, so Proposed topics provably have zero rows and fall out on their
own — while Merged and Archived topics stay filterable for as long as their history does.
Filtering on Status instead would offer topics that always return zero conversations.
            
Unpaginated by design: the taxonomy is capped at 30 Active topics per agency, so this is
a ListPersonas-shaped endpoint, not a GetSources-shaped one.

**Request body:** [`TopicOptionsRequest`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `TopicOptionsResponse`
- `403` — Forbidden → `ProblemDetails`

**Example:**
```bash
curl -X POST "https://api.closebot.com/analytics/topics/options" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---
