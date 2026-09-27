# Billing — endpoint reference

Base URL: `https://api.closebot.com`  ·  Auth header: `X-CB-KEY`  ·  14 endpoint(s)

Source: `schema/openapi.json` (auto-generated from `https://megastream25-api.closebot.com/swagger/v1/swagger.json`)

---

### `GET /agency/billing/ai-cost-breakdown`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** AI cost breakdown for a period

Splits the period's AI spend by what drove it — global prompt base, node instructions,
tool descriptions, knowledge base, tool results, conversation history, response format,
thinking, emitted tool calls and the reply itself.
            
Injected variable values are costed against the section they were injected into rather
than broken out separately, so the same substitution cannot appear under both the agent
node and the global prompt area.
            
The response separates flat-rate ("standard") traffic from cost-based ("metered") traffic.
Only the metered block carries shares and segments; multiply the shares by the metered
portion of the invoice to get dollars. Standard traffic is billed at a fixed per-message
rate, so it is reported as a call count alone — its real cost composition is captured
internally but deliberately never emitted, because it would describe money the customer
did not pay.

**Query params:**
- `startTime` (string, optional)
- `endTime` (string, optional)
- `sourceId` (string, optional)

**Responses:**
- `200` — OK → `AiCostBreakdownDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/billing/ai-cost-breakdown" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/billing/balance`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get agency balance

Gets the balance of the agency.

**Responses:**
- `200` — OK → `BalanceDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/billing/balance" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/billing/balance/source/{sourceId}`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get source balance

Gets the balance of the source.

**Path params:**
- `sourceId` (string, required) — The source ID.

**Responses:**
- `200` — OK → `BalanceDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/billing/balance/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/billing/options`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get agency billing

**Responses:**
- `200` — OK → `BillingOptionsDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/billing/options" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /agency/billing/options`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update agency billing

**Request body:** [`UpdateBillingConfigInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK → `BillingOptionsDto`

**Example:**
```bash
curl -X PUT "https://api.closebot.com/agency/billing/options" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /agency/billing/re-billing`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Get re-billing settings

**Responses:**
- `200` — OK → `ReBillingDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/billing/re-billing" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `PUT /agency/billing/re-billing`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Update re-billing

**Request body:** [`ReBillingUpdateInput`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X PUT "https://api.closebot.com/agency/billing/re-billing" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /agency/billing/refill`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Refill agency wallet

Attempts to charge the payment method on file for the agency to refill the agency wallet.

<strong>
Invoking this endpoint will charge you. Use with caution.
</strong>

**Request body:** [`CreateRefillDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/agency/billing/refill" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `POST /agency/billing/refill/source/{sourceId}`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Refill source wallet

**Path params:**
- `sourceId` (string, required) — The source ID.

**Request body:** [`CreateRefillDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X POST "https://api.closebot.com/agency/billing/refill/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `GET /agency/billing/transactions`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List agency transactions

**Query params:**
- `status` (string, optional) — Filter by status when included. Statuses are: pending, succeeded, failed.
- `type` (string, optional) — Filter by transaction type when included. Comma-separated list of:
- `page` (integer, optional)
- `pageSize` (integer, optional)

**Responses:**
- `200` — OK → `TransactionDtoPaginated`

**Example:**
```bash
curl "https://api.closebot.com/agency/billing/transactions" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/billing/transactions/source/{sourceId}`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List source transactions

**Path params:**
- `sourceId` (string, required) — The source ID.

**Query params:**
- `status` (string, optional) — Filter by status when included. Statuses are: pending, succeeded, failed.
- `type` (string, optional) — Filter by transaction type when included. Comma-separated list of:
- `page` (integer, optional)
- `pageSize` (integer, optional)

**Responses:**
- `200` — OK → `TransactionDtoPaginated`

**Example:**
```bash
curl "https://api.closebot.com/agency/billing/transactions/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `POST /agency/billing/transactions/source/{sourceId}`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Add source transaction

**Path params:**
- `sourceId` (string, required) — The source ID.

**Request body:** [`AddSourceTransactionDto`](../../schema/openapi.json) (`application/json`)

**Responses:**
- `201` — Created → `TransactionDto`

**Example:**
```bash
curl -X POST "https://api.closebot.com/agency/billing/transactions/source/<sourceId>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...see schema...}'
```

---

### `DELETE /agency/billing/transactions/source/{sourceId}/{id}`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** Delete source transaction

**Path params:**
- `sourceId` (string, required) — The source ID.
- `id` (integer, required) — ID of the transaction to delete.

**Responses:**
- `200` — OK

**Example:**
```bash
curl -X DELETE "https://api.closebot.com/agency/billing/transactions/source/<sourceId>/<id>" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

### `GET /agency/billing/usages`

**Tag:** Billing · **OperationId:** `` · **Auth:** `X-CB-KEY`

**Summary:** List billed usages

**Query params:**
- `startTime` (string, optional) — The start time.
- `endTime` (string, optional) — The end time.

**Responses:**
- `200` — OK → `BilledUsageDto`

**Example:**
```bash
curl "https://api.closebot.com/agency/billing/usages" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---
