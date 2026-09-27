# Live Message API

The runtime endpoint that drives CloseBot conversations. Separate from the REST management API.

## Endpoint

```
POST https://api.closebot.ai/message
```

Backing infrastructure: `POST https://xljmafyych.execute-api.us-west-2.amazonaws.com/message` (AWS Lambda, US-West-2).

## Auth

| Method | When |
|---|---|
| `X-CB-KEY: $CLOSEBOT_API_KEY` header | Always works |
| `api_key` field in JSON body | Alternative |
| **No auth** | Allowed when `id` resolves to a contact in an integrated GoHighLevel CRM source |

## Body parameters (full table)

| Param | Type | Default | Description |
|---|---|---|---|
| `id` | string | — | **Required.** Contact identifier — drives conversation tracking and account resolution |
| `api_key` | string | — | Optional if integrated with GHL |
| `@rep_name` | string | — | Bot's self-identification name (injected into prompt) |
| `@lead_name` | string | — | Contact's first name (injected into prompt) |
| `message` | string | — | The inbound message requiring a bot response |
| `goals_finished` | string[] | — | Pre-completed goals to skip |
| `limit` | int32 | `100` | Max processing attempts per contact (overrides bot-level cap) |
| `extra_prompt` | string (≤500 chars) | — | Additional one-shot instructions |
| `bot` | int32 | null | Bot ID — earliest-created bot used if unspecified |
| `model` | string | `text-davinci-003` | One of: `text-davinci-003`, `gpt-4`, `gpt-4-1106-preview` |
| `followup` | boolean | `false` | Process a follow-up rather than a reply |
| `is_update` | boolean | `false` | Update bot memory only — do not generate a reply |
| `character_limit` | int32 | `225` | Output character maximum |
| `delay` | int32 | `0` | Processing delay in seconds |
| `channel` | string | — | Override channel: `Live_Chat`, `SMS`, `FB`, `Email`, `IG`, `WhatsApp` |
| `@<custom>` | string | — | Any param prefixed with `@` is injected as a custom variable into the prompt |

## Status codes

See [`04-error-codes.md`](./04-error-codes.md) for the full table. Key codes:

`200` OK · `201` rerun · `410` no account · `420` no credits · `430` missing id · `440` missing message · `450` bot limit · `460` account limit (`[INCOMPLETE]` threshold).

## Example — minimal

```bash
curl -X POST https://api.closebot.ai/message \
  -H "Content-Type: application/json" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -d '{
    "id": "contact_abc123",
    "message": "What are your hours?"
  }'
```

## Example — full

```bash
curl -X POST https://api.closebot.ai/message \
  -H "Content-Type: application/json" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -d '{
    "id": "contact_abc123",
    "@lead_name": "Jamie",
    "@rep_name": "Avery",
    "message": "I want to book a consult.",
    "bot": 4271,
    "model": "gpt-4-1106-preview",
    "channel": "SMS",
    "character_limit": 320,
    "extra_prompt": "Be concise. Always offer Tuesday 2-4pm first.",
    "goals_finished": ["greeting", "qualify_intent"]
  }'
```

## Integrated vs non-integrated mode

- **Non-integrated**: response body contains the bot's reply directly (`200 OK`).
- **Integrated** (e.g., GHL CRM source attached): `200 OK` is returned synchronously; the bot's reply is delivered **out-of-band** through the integrated channel (GHL conversation). Do not parse the response body for the reply text in this mode.

`[INCOMPLETE]` — exact response body schema for non-integrated mode is not published in the upstream reference. Inspect a real response and update `schema/live-message.json`.

## Why this is a separate API

The REST management plane (`api.closebot.com`) is for configuration and read APIs. The live message plane (`api.closebot.ai`) is the **inference/runtime** plane — high-throughput, latency-sensitive, AWS Lambda-backed. Keep them logically separate in any client.
