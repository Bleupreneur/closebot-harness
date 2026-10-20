# Safety — endpoint risk tiers

Any agent acting on this package must classify the endpoint **before** calling. Three tiers, decreasing in safety.

## Tier 0 — Read-safe (call freely)

All `GET` operations. Never mutate state. No approval needed.

```
GET /account/apiKey               GET /bot                          GET /lead
GET /agency/current                GET /bot/{id}                     GET /lead/{leadId}
GET /agency/source                 GET /bot/{id}/steps               GET /library/files
GET /agency/billing/balance        GET /botMetric/*                  GET /persona
GET /agency/billing/transactions   GET /bot/nodeDescriptors          GET /smart-faq
GET /leaderboard/*                 GET /report, /dashboard           GET /lead/{leadId}/topics
… (all GET endpoints)
```

## Tier 1 — Mutating (call after stating intent)

`POST` / `PUT` / `PATCH` that create or modify content. Agent must:
1. State the intent in plain language ("I'm going to create a bot named X").
2. Show the exact body that will be sent (`--dry-run` first).
3. Proceed only if the user has not objected.

Examples:
```
POST /bot                      PUT  /bot/{id}                  POST /bot/{id}/save
POST /bot/ai                   PUT  /lead/{leadId}/ai-toggle   POST /lead/{leadId}/send-message
POST /agency/source            PUT  /persona/{id}              POST /persona
POST /library/files            POST /smart-faq
POST /smart-faq/answer         POST /webhook/event/{sourceId}
PUT  /library/files/{fileId}   ← replaces file content in place; goes live on re-index, NO publish gate
POST /bot/preview-import       POST /agency/source/{sourceId}/custom-channels
PUT  /agency/source/{sourceId}/custom-channels/{channelId}
POST /bot/{id}/source/{sourceId}/mcp-server   ← wires an MCP server into a live bot's tooling
POST /report                   PUT  /report/{id}               POST /report/{id}/shares   ← grants other accounts read access to the report
POST /dashboard                PUT  /dashboard/{id}
POST /analytics/topics         POST /analytics/topics/options  ← read-only queries sent as POST (Tier 1 by method only)
POST https://api.closebot.ai/message  ← Live Message (mutating: sends real reply)
```

`DELETE /bot/{botId}/testSession/{leadId}` is exempt from Tier 2 (ephemeral test lead;
`cb bot test` deletes it automatically; `overrides.json` `tier2Exempt`).

## Tier 2 — Destructive / irreversible (require explicit user confirmation)

Every `DELETE` operation is Tier 2 (the CLI enforces this), except the ephemeral test-session delete noted above. The table lists the most consequential ones.

Hard stop. Agent must **not** call these without the user typing back an explicit confirmation in the same conversation. `--dry-run` is mandatory; show the full plan first.

| Endpoint | Why it's destructive |
|---|---|
| `DELETE /bot/{id}` | Removes the bot, including its job-flow graph |
| `DELETE /account/apiKey/{keyId}` | Revokes an API key — may lock out clients |
| `DELETE /lead/{leadId}` | Removes a lead and its conversation history |
| `DELETE /library/files/{fileId}` | Removes a knowledge file; bots citing it may degrade |
| `DELETE /persona/{id}` | Removes persona; any bot referencing it may break |
| `DELETE /smart-faq/{id}` | Removes a FAQ entry |
| `DELETE /agency/billing/transactions/source/{sourceId}/{id}` | Reverses a billing transaction |
| `DELETE /agency/source/{id}` | Disconnects a CRM source — bots wired to it stop working |
| `DELETE /hierarchy/{id}` | Removes a folder; affects organization |
| `DELETE /notifications/{id}` | Removes a notification record |
| `DELETE /bot/{botId}/testSession/{leadId}` | Deletes a test session — **exempt** (Tier 1): ephemeral test lead, `cb bot test` deletes it automatically (`overrides.json` `tier2Exempt`) |
| `POST /bot/{id}/publish` | Promotes a bot version to **production** — clients see this immediately |
| `POST /agency/billing/refill` | Charges the saved payment method (real money) |
| `POST /agency/billing/refill/source/{sourceId}` | Charges per-source wallet (real money) |
| `PUT /agency/billing/options` | Changes auto-refill settings, which can trigger automatic card charges |
| `PUT /agency/billing/re-billing` | Changes how clients are re-billed |
| `POST /agency/billing/transactions/source/{sourceId}` | Records a billing transaction |
| `POST /bot/{botId}/testSession/{leadId}/rollback` | Rolls back a test session state |
| `POST /bot/{id}/saveTools` | Replaces the bot's tool set wholesale |
| `DELETE /agency/source/{sourceId}/custom-channels/{channelId}` | Removes a custom channel — conversations routed through it stop |
| `DELETE /bot/{id}/source/{sourceId}/mcp-server` | Detaches an MCP server a live bot may depend on for tools |
| `DELETE /report/{id}` | Removes a report and revokes every share on it |
| `DELETE /report/{id}/shares/{accountId}` | Revokes one account's access to a shared report |
| `PUT /report/{id}/shares` | Replaces the share list (PUT semantics, unprobed) — accounts left out lose access; `[]` unshares everyone (`overrides.json` `tier2`) |
| `DELETE /dashboard/{id}` | Removes a dashboard |

## Hard rules for agents

1. **Never call Tier 2 without explicit user confirmation in the same turn.** "I'll delete bot 12345 — confirm?" then wait. Don't accept "yes" from a previous turn unless the user reaffirms now.
2. **Always `--dry-run` first** for Tier 2. Show the resolved URL, headers (with key redacted), and full body. Then ask.
3. **Never log the API key.** Replace with `***` in any output, debug, or commit.
4. **Refuse to chain Tier 2 calls** in a single agent turn (e.g., "delete then re-create"). Force the user back into the loop between them.
5. **Refuse OAuth-only ops.** Connecting a brand-new GHL CRM source can't be done via API — surface to the user and stop.
6. **Money is Tier 2.** Any billing endpoint moves real money — treat as destructive even though it's `POST`.

## Live Message safety

`POST https://api.closebot.ai/message` is **Tier 1 mutating** — it sends a real response into a real conversation channel (SMS, FB, WhatsApp, …). Do not call with arbitrary `id` values. Use the test-session endpoints for development:

```
POST /bot/{botId}/testSession
POST /bot/{botId}/testSession/message
DELETE /bot/{botId}/testSession/{leadId}    ← Tier 1 (tier2Exempt; cb bot test cleans up)
```

Test sessions are isolated and don't fire integrated channels.
