# Leaderboard — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  3 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /leaderboard/board`

**Tag:** Leaderboard · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** One leaderboard: the leaders, the caller's neighbourhood, and where the caller stands.

**Query params:**
- `scope` (string, optional) — "source" ranks individual sources, "agency" ranks whole accounts.
- `metric` (string, optional) — A key from GET /leaderboard/metrics.
- `compare` (string, optional) — Who to rank against: "all" (default), or "industry" for the subject's own vertical.
- `period` (string, optional) — "current" (default) or "previous".
- `entityId` (string, optional) — Which of the caller's own entities Closebot.Api.Controllers.LeaderboardController.GetBoardResponse.Me,
- `limit` (integer, optional) — How many leaders to return. 1-10, default 10.
- `around` (integer, optional) — How many neighbours either side of the caller. 0-5, default 5.

**Responses:**
- `200` — OK → `GetBoardResponse`

**Example:**
```bash
curl "https://api.closebot.com/leaderboard/board" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /leaderboard/metrics`

**Tag:** Leaderboard · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** The metrics a board can be ranked by. Clients should build their columns from this rather
than hardcoding a list, so changing the headline set needs no frontend deploy.

**Responses:**
- `200` — OK → `LeaderboardMetricDto`

**Example:**
```bash
curl "https://api.closebot.com/leaderboard/metrics" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /leaderboard/profile`

**Tag:** Leaderboard · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** (no summary)

**Query params:**
- `scope` (string, optional)
- `entityId` (string, optional)
- `compare` (string, optional)
- `period` (string, optional)

**Responses:**
- `200` — OK → `GetProfileResponse`

**Example:**
```bash
curl "https://api.closebot.com/leaderboard/profile" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---
