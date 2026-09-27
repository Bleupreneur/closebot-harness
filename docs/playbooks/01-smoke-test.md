# Playbook 1 — Verify the package + key work

**Tier 0 (read-safe)**. Run this first, every session.

```bash
export CLOSEBOT_API_KEY="cb_..."
bash scripts/smoke.sh
```

Expected: 10/10 green. If any red, see the failure message in `scripts/smoke.sh`.

## What it checks

1. `$CLOSEBOT_API_KEY` is set
2. Local `schema/openapi.json` matches upstream Swagger (drift detection)
3. REST auth works: `GET /account/apiKey` returns 200
4. Agency-level reads work: `/agency/current`, `/agency/source`, `/agency/billing/balance`
5. Bot-level reads work: `/bot`, `/bot/nodeDescriptors`
6. Lead and library reads work
7. Live message endpoint reachable: `POST /message` with empty body returns the documented `430 No ID`

## Manual one-liner alternative

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/account/apiKey" | jq '. | length'
# Expect: a number (count of your API keys). If "Unauthorized", your key is bad.
```
