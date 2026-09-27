# Error Codes

Two distinct surfaces, two distinct error vocabularies.

## REST Management API (`api.closebot.com`)

Standard HTTP semantics. Most operations declare only `200 Success` in the Swagger spec — implicit standard errors apply.

| Code | Meaning | Agent action |
|---|---|---|
| `200` / `201` | Success | continue |
| `400` Bad Request | Validation failure | inspect body, fix input, retry |
| `401` Unauthorized | Missing or invalid `X-CB-KEY` | re-read `$CLOSEBOT_API_KEY`; do not retry blindly |
| `403` Forbidden | Authenticated but key lacks scope | escalate — likely needs owner-level key |
| `404` Not Found | Resource does not exist | confirm IDs against `GET` listing endpoints |
| `409` Conflict | Resource state collision (e.g., publishing an unsaved bot) | `POST /bot/{id}/save` then retry |
| `429` Too Many Requests | `[INCOMPLETE]` — not documented but possible. Backoff exponentially |
| `5xx` Server Error | Upstream fault | retry once with backoff; if persists, surface to user |

Most success responses are envelope-less — bare DTO JSON. List endpoints return arrays; detail endpoints return objects.

## Live Message API (`api.closebot.ai/message`)

CloseBot uses **non-standard** numeric codes here. Treat them as documented states, not generic 4xx.

| Code | Name | Meaning | Agent action |
|---|---|---|---|
| `200` | OK | Message processed (no integration mode) | use `body.response` |
| `200` | OK Async | Integrated mode — reply will arrive on the integrated channel (e.g., GHL conversation) | do not expect the reply in this response body |
| `201` | Rerun | Another inbound message arrived during processing; this attempt was preempted | retry once after a short delay (e.g., 2s) |
| `410` | No Account | The account resolved from `id` does not exist / is deleted. **Verified 2026-05-04**: also returned for empty body / unrecognized id — CloseBot resolves account *before* validating other fields, so `410` is the catch-all for "request didn't reach a real account." | surface to user; do not retry |
| `420` | No Credits | Account is out of credits | call `POST https://api.closebot.com/agency/billing/refill` (with user auth) or surface to user |
| `430` | No ID | Request body missing `id`. **Verified 2026-05-04**: in practice rarely surfaces — most missing-`id` calls already return `410` first. Treat `430` as the documented intent, `410` as the more common observed code. | fix payload, retry |
| `440` | No Message Body | Request body missing `message` | fix payload, retry |
| `450` | Bot Limit Reached | This contact has hit the bot's per-contact processing cap | raise `limit` body field or stop |
| `460` | Account Limit | Account-level cap | `[INCOMPLETE]` — exact threshold undocumented; surface to user |
| `4XX` | Other | Generic client error | inspect body |

**Validation order (verified empirically via `scripts/smoke.sh` on 2026-05-04):**
1. Account resolution from `id` and/or `X-CB-KEY` → `410` if it fails
2. Required field check → `430` (`id`), `440` (`message`)
3. Bot/account limits → `450`, `460`, `420`

## Webhook (Custom Webhook Job Flow node)

Outbound calls made by CloseBot to **user-supplied** URLs. CloseBot follows the target system's status semantics; non-2xx responses surface as test failures inside the Job Flow builder. There is no CloseBot-defined error vocabulary on this surface.

## Best-effort body shape on errors

`[INCOMPLETE]` — the Swagger spec does not declare a unified error envelope. Empirically (from sample API responses): response bodies on REST errors are typically `{ "message": "<human-readable>" }` or a plain string. Live Message errors are status-code-only with empty bodies. Agents should not depend on a fixed error envelope — branch on status code, log the body verbatim.
