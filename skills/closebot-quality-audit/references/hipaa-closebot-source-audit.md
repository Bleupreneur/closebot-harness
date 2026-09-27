# HIPAA CloseBot Source Conversation Audit

Validated on a HIPAA-enabled GHL location where both `/conversations/{id}/messages` and `/conversations/messages/export` returned 401, while CloseBot retained a complete source-side transcript stream.

## Reliable transcript retrieval

Use the source-level metric endpoints:

```http
GET /botMetric/messageCount?sourceId={sourceId}&start={iso}&end={iso}
GET /botMetric/messages?sourceId={sourceId}&start={iso}&end={iso}&maxCount=100
```

### Critical pagination behavior

`/botMetric/messages` silently caps a response at **100 rows**, even when `maxCount=10000`. It exposes no cursor. Never treat one request as a complete source audit.

Use bounded date partitioning:

1. Split the requested window into one-day ranges.
2. Request each range with `maxCount=100`.
3. If a range returns exactly 100 rows, bisect that range and recursively request both halves.
4. Stop splitting when a range returns fewer than 100 rows (or reaches a one-minute floor).
5. Deduplicate globally by `messageId`.
6. Compare the final unique row count to `/botMetric/messageCount` for the full window. Do not publish unless they reconcile exactly.

A validated run reconciled 2,726 reported messages to 2,726 unique retrieved messages.

## Lead-to-contact crosswalk

Use `POST /lead/search`. The body must include the array properties even when empty; omitting them or passing the wrong wrapper produces a 400 deserialization error.

```json
{
  "totalOnly": null,
  "sourceOnlyFast": null,
  "sourceIds": ["src_..."],
  "channels": [],
  "botIds": [],
  "personaIds": [],
  "offset": 0,
  "count": 100,
  "search": null,
  "minimumResponses": null,
  "lastMessageDirection": null,
  "followUpScheduled": null
}
```

The successful response uses `leads` plus `total`. Paginate by `offset += 100`; map each CloseBot `lead.id` to `lead.contactId` for direct GHL links and appointment joins.

`minimumResponses: 1` is useful for identifying leads with at least one verified bot response. `botIds: [id]` scopes that response evidence to a specific historical/current bot.

## Message interpretation

Useful fields include:

- `leadId`, `botId`, `personaId`
- `timestamp`, `channel`
- `fromBot`, `direction`, `message`
- `activities`

Recommended role mapping:

- `fromBot=true` → bot message
- `fromBot=false` and `direction=to_lead` → human/other outbound
- otherwise → lead/inbound

Group by `leadId`, sort by timestamp, and calculate inbound count, bot-response count, first-response delay, last-message role, unanswered endings, and activity/tool evidence.

## Audit screening flags

Use transcript text only as a review queue, not as an automatic final judgment. Useful screens include:

- inbound lead but zero verified bot responses
- last message inbound / potentially unanswered
- opt-out language
- booking or availability claims requiring appointment reconciliation
- pricing discussion
- credential-risk phrases
- medical guarantee/diagnosis claims

Join booking claims to live appointment records before calling them fabricated or failed.

## Execution logs

`GET /botMetric/logs` can expose model/provider/prompt/action details. A source-wide query may return 504. Narrow by `leadId` or `messageId` when execution traces are required.

`GET /lead/{leadId}/messages` may return 404 and is not the reliable history route for live source auditing.

## GHL call evidence under HIPAA

When exact GHL message history is blocked, `GET /conversations/search?contactId=...` still returns conversation metadata. `messageTypes` containing numeric type `1` (`TYPE_CALL`) or `34` (`TYPE_CUSTOM_CALL`), or a `lastMessageType` containing `CALL`, proves call-channel presence.

Report conservatively:

- no call type → `0 recorded` / `No call channel recorded`
- call type present → `1+ verified` (lower bound)

Do not turn `1+` into an invented exact count. Exact call totals require an authorized private GHL call-reporting read.

## Privacy

CloseBot transcript rows and GHL contact joins can contain PHI/PII. Keep detailed workbooks outside git, link names directly to GHL, store only aggregates in the durable client workspace, and label screening flags as requiring human review.
