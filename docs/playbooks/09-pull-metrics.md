# Playbook 9 — Pull message + booking metrics

**Tier 0 (read-safe)**. Useful for dashboards, weekly reports, and post-publish health checks.

## 1. Agency-wide summary

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/botMetric/agencySummary" | jq .
```

## 2. Message volume

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/botMetric/messageCount?start=2026-04-01&end=2026-05-01" | jq .
```

## 3. Booking graph

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/botMetric/bookingGraph?start=2026-04-01&end=2026-05-01" | jq .
```

## 4. Action counts per bot

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/botMetric/actionCount" | jq .
```

## 5. Leaderboards

The old `/botMetric/leaderboard` and `/botMetric/localleaderboard` endpoints were removed
upstream; use `/leaderboard/*` (see [`docs/endpoints/leaderboard.md`](../endpoints/leaderboard.md)).

```bash
# Which metrics can be ranked (keys for ?metric=)
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/leaderboard/metrics" | jq .

# The board: leaders, your neighbourhood, and where you stand
# scope=source|agency · compare=all|industry · period=current|previous
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/leaderboard/board?scope=agency&compare=all&period=current" | jq .

# Your own leaderboard profile
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/leaderboard/profile" | jq .
```

## 6. Quality / feedback signals

```bash
# Messages with explicit user feedback
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/botMetric/messageFeedback" | jq .

# Messages with likes
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/botMetric/messageLikes" | jq .

# Reasons given for negative feedback
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/botMetric/messageReason" | jq .
```

## 7. Logs (for debugging individual conversations)

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/botMetric/logs?leadId=$LEAD_ID&limit=50" | jq .
```

## All metric endpoints

See [`../endpoints/botmetric.md`](../endpoints/botmetric.md) for all 12 endpoints with parameter schemas.

## Common pattern — daily health digest

```bash
DATE=$(date -u +%Y-%m-%d)
{
  echo "## CloseBot daily — $DATE"
  echo ""
  echo "### Volume"
  curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/botMetric/messageCount?from=$DATE&to=$DATE" | jq .
  echo ""
  echo "### Bookings"
  curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/botMetric/bookingGraph?from=$DATE&to=$DATE" | jq .
  echo ""
  echo "### Negative feedback"
  curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/botMetric/messageReason" | jq '.[] | select(.date == "'"$DATE"'")'
} > "reports/daily-$DATE.md"
```
