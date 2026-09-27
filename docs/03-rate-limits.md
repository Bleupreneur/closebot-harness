# Rate Limits

`[INCOMPLETE]` — CloseBot does not publish rate-limit numbers in any public source we checked (developers.closebot.com, docs.closebot.com, closebot.readme.io, llms.txt, Swagger spec).

## What we know

- The **Live Message API** documents a status code `460 Account Limit` — implying **per-account throttling exists**, but the threshold (requests/minute, messages/day, etc.) is not documented.
- The Live Message API also documents `420 No Credits` — a **credit-based** soft cap, distinct from rate limiting. Refill via `POST /agency/billing/refill` or `POST /agency/billing/refill/source/{sourceId}`.
- Bot-level cap: status code `450 Bot Limit Reached` — each bot has a per-contact processing cap. The body parameter `limit` (default `100`) on `POST /message` overrides the per-call cap.

## Practical guidance for agents

Until CloseBot publishes numbers:

1. **Apply exponential backoff** on any non-`200`/`201` from the live message endpoint: 1s → 2s → 4s → 8s, max 30s, max 5 retries.
2. **Treat `460` as a hard stop** — surface to the user; do not retry blindly.
3. **Treat `420` as actionable** — the agent can call `POST /agency/billing/refill` (with explicit user authorization on amount).
4. **For batch operations** (e.g., creating many bots), pace at ≤ 5 req/s as a safe default and monitor for HTTP 429 (which is **not** in the documented schema — flag if observed).

## Headers to watch

`[INCOMPLETE]` — no documented `X-RateLimit-*` headers. Inspect actual responses (`curl -i`) and update this file if/when you observe them.
