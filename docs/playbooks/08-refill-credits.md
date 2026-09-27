# Playbook 8 — Refill agency credits

**TIER 2 — moves real money.** Charges the saved payment method on the agency. Always `--dry-run` and require explicit user confirmation in the same turn.

## 1. (Tier 0) Inspect current balance

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/agency/billing/balance" | jq .
```

## 2. (Tier 0) Inspect re-billing settings (auto-refill threshold and amount)

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/agency/billing/re-billing" | jq .
```

## 3. (Tier 0) Inspect billing options (payment method, etc.)

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/agency/billing/options" | jq .
```

## 4. (Tier 2) Show the planned charge to the user — DO NOT call yet

```
About to refill agency wallet:
  amount  : $50.00 USD
  source  : <payment method id>
  endpoint: POST https://api.closebot.com/agency/billing/refill
This is a real charge.
Type "yes refill 50" to proceed.
```

## 5. (Tier 2) After explicit confirmation in this turn — call

```bash
curl -sS -X POST "https://api.closebot.com/agency/billing/refill" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 50.00, "currency": "USD" }'
```

Inspect the request schema before sending:
```bash
jq '.paths."/agency/billing/refill".post.requestBody' schema/openapi.json
```

## 6. (Tier 0) Confirm the charge landed

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/agency/billing/transactions" | jq '.[0:3]'
```

## Per-source refill (sub-account)

Same flow but scoped to one source:
```bash
SOURCE_ID="<source id>"
curl -sS -X POST "https://api.closebot.com/agency/billing/refill/source/$SOURCE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 25.00, "currency": "USD" }'
```

## What you should NOT auto-do

- Auto-refill on every `420 No Credits` from the live message endpoint — surface to the user instead.
- Refill more than the user asked for to "round up".
- Configure auto-rebilling without explicit user input on threshold/amount (`PUT /agency/billing/re-billing`).
