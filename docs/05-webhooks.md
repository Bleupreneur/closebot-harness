# Webhooks

CloseBot has **two** webhook concepts. Don't conflate them.

## 1. Custom Webhook Job Flow node — outbound, user-defined

CloseBot does **not** publish a platform-level event subscription API. Instead, the `Custom Webhook` action lives inside the bot's Job Flow builder. The bot designer:

1. Adds a Custom Webhook node to the flow.
2. Configures a destination URL (typically pasted from the target system's API docs).
3. Picks the HTTP method (GET / POST / etc.).
4. Sets query params, body (JSON or Form Data), and headers (used for auth tokens).
5. Toggles **synchronous** (default — flow pauses for response, response variables become available downstream) vs **asynchronous** (deselect the sync option; flow proceeds immediately).
6. Runs an initial **test with fake values** to populate response variables.

| Setting | Where | Notes |
|---|---|---|
| URL | top of the node config | required |
| Method | dropdown | GET, POST, PUT, DELETE, PATCH |
| Query | "Query" field | `name=value` pairs |
| Body | "Body Data" field | JSON or Form Data |
| Headers | Advanced Settings | typically auth tokens |
| Sync/Async | checkbox | default sync |

Example from CloseBot docs: `GET https://api.agify.io/?name=<value>` returning `{count, age, name}` — fields become flow variables.

There is no API endpoint for **defining** these webhooks programmatically; they are part of the bot graph and are configured via the Bot designer / `POST /bot/{id}/save`.

Official reference: the Custom Webhook node in CloseBot's docs at <https://docs.closebot.com>.

## 2. `POST /webhook/event/{sourceId}` — REST endpoint

The Swagger spec exposes a single endpoint:

```
POST https://api.closebot.com/webhook/event/{sourceId}
```

Tag: `Webhook`. Used to **send an ad-hoc webhook event** scoped to a source. Spec: see [`docs/endpoints/webhook.md`](./endpoints/webhook.md).

`[INCOMPLETE]` — the request body schema for this endpoint is not detailed in the Swagger; agents should inspect `schema/openapi.json` directly and match the type referenced by the endpoint, then verify with a test call.

## What CloseBot does **NOT** offer

- No subscribe-to-events webhook product (no "I want a callback when X happens").
- No outbound webhook signature / HMAC scheme published.
- No retry policy published for the Custom Webhook node (`[INCOMPLETE]`).
