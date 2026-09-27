# Base URLs

CloseBot exposes **two** distinct API surfaces. Don't mix them — paths are not portable.

## REST Management API

| | |
|---|---|
| Base URL | `https://api.closebot.com` |
| Spec source | `https://megastream25-api.closebot.com/swagger/v1/swagger.json` |
| OpenAPI version | 3.0.1 |
| Paths | 91 |
| Operations | 126 |
| Tags | 17 |
| Use for | Bots, Agencies, Billing, Leads, Sources, Library, Metrics, FAQ, Personas, Notifications, Webhooks |

## Live Message API

| | |
|---|---|
| Primary base URL | `https://api.closebot.ai` |
| Backing infra | `https://xljmafyych.execute-api.us-west-2.amazonaws.com` (AWS Lambda, US-West-2) |
| Spec | `schema/live-message.json` (hand-built; **not** in the upstream Swagger) |
| Endpoints | 1 — `POST /message` |
| Use for | Sending a message into a CloseBot-managed conversation and receiving the bot's reply |

## How agents pick the right one

| If you want to... | Use |
|---|---|
| Manage configuration (create a bot, attach a source, list leads, refill credits, query metrics) | REST: `api.closebot.com` |
| Drive a live conversation (deliver an inbound message, get the bot's response) | Live Message: `api.closebot.ai/message` |

## Mintlify portal note

`https://developers.closebot.com` renders the docs as a Mintlify site. The path `https://developers.closebot.com/api-reference/openapi.json` returns a Mintlify **placeholder spec** (Plant Store demo) — **`[INCOMPLETE]`** — and should be ignored. Always pull the real spec from the megastream25 origin above.
