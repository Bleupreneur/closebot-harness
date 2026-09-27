> **cb equivalents:** the CloseBot-side calls here are `cb bot post-source <botId> --id <sourceId> --body '{...flowVariableValues...}'`
> (source re-attach with `source.calendar_id`), `cb bot get-bot-2 --id <botId> --json | jq '.sources[0].flowVariableValues'`
> (verify), and `cb bot post-savetools <botId>` (tools). The GHL calls are GHL's API, not CloseBot's — run them via the
> `ghl` CLI or the client's PIT token, never with a token scoped to a different location (location-locked, 401s). The `{{start_date}}`/`{{service_id}}`
> custom parameters below are subject to the parameter-binding defect in `custom-tool-integrations.md` — as of 2026-09-05 only the
> parameterless **Get Services** tool and `{{contact.id}}` bodies are proven to render.

# GHL Service Bookings — wiring IV-drip/aesthetics booking into CloseBot tools

Verified live 2026-08-28 on a client location (`<LOCATION_ID>`) for bot `bot_XXXXXXXXXXXXXXXX` (v0.0.5, tools only — 17 nodes / 20 edges untouched).

## Why the normal calendar API fails here

IV drips, Botox, and fillers are NOT plain GHL calendars. `GET /calendars/?locationId=X` returns only 7 personal/consult calendars — no IV anything. The services live in the **Service Bookings** surface (docs: marketplace.gohighlevel.com/docs/ghl/calendars/service-bookings).

## Verified endpoints (client location PIT token, all live-tested)

| Operation | Call | Notes |
|---|---|---|
| List services | `GET https://services.leadconnectorhq.com/calendars/services/all?locationId=X` (Version: 2021-07-28 or v3) | ~100 services on that location: e.g. `example-iv-drip` (_id `<SERVICE_ID>`, 60min), `lip-filler`, etc. Fields: `_id`, `slug`, `name`, `serviceDuration(Unit)`, `payment.amount`, `teamMembers[].id`. |
| Service detail | `GET /calendars/services/{serviceId}?locationId=X` (Version: v3) | Adds `preBuffer`/`postBuffer`, `locations`, `addOns`. |
| Create booking | `POST /calendars/services/bookings` (Version: **v3**) | Body: `{locationId, contactId, startTime, endTime, timezone, services:[{id}], title?, status:"confirmed"}`. Query flags: `overrideAvailability`, `skipSchedulingNotice`. |
| List bookings | `GET /calendars/services/bookings?locationId=X&startTime=<ISO>&endTime=<ISO>` (v3) | `startDate`/`endDate` are rejected — must be `startTime`/`endTime`. |
| Free slots (calendar-based) | `GET https://backend.leadconnectorhq.com/calendars/{calendarId}/free-slots?startDate=<epoch-ms>&endDate=<epoch-ms>&timezone=America/New_York` (Version: 2021-04-15) | Day-keyed map `{date: {slots: [ISO...]}}`. `locationId` is REJECTED here (422). Works on real calendars (verified returning slots); does NOT work with a service `_id` (404 "Calendar not found"). |

## The open problem: service ≠ calendar

A service `_id` is not a calendarId, and the team-member ids on the service (`teamMembers[].id`) are also not calendarIds (free-slots 404s on both). The active personal calendar DID return slots, so the working CloseBot wiring used:
- availability = free-slots on the active calendar (`<CALENDAR_ID>`)
- booking = POST service booking with the service `_id` from Get Services

If availability must reflect per-service staff calendars, the missing link is the slot endpoint the public services widget calls (embed at `links.<client-domain>/booking/{loc}/sc/{serviceCategoryId}` — the HTML loads `stcdn.leadconnectorhq.com` JS; the slot XHR was not extracted before session end). Note `serviceCategoryId` (e.g. `<CATEGORY_ID>` = an IV-infusions category) is what appears in the public booking URL.

## The three CloseBot custom tools (wired, zero node edits)

1. **GHL Get Services** — GET `/calendars/services/all?locationId=...`, no params. AI matches customer words → service `_id`.
2. **GHL Get Availability** — GET `.../calendars/{calendarId}/free-slots?startDate={{start_date}}&endDate={{end_date}}&timezone=America/New_York`, customParameters `start_date`/`end_date` (epoch-ms, required).
3. **GHL Book Service** — POST `/calendars/services/bookings`, `bodyType: json`, body with `{{contact.id}}`, `{{service_id}}`, `{{start_time}}`, `{{end_time}}`, `{{timezone}}`, `{{service_title}}` as required customParameters. REMEMBER: execution uses the `body` field (jsonBody ignored at runtime) — keep both in sync.

Wire into every Method's `EnabledCustomTools` + `ToolOrder`; save with `botSteps` wrapper; readback-verify node/edge counts unchanged when the task is "tools only".

## Source-level fix that matters

The bot's built-in `check_availability` fails with "No calendars are available for this source" when `source.calendar_id` is empty — and that failure poisons the turn before custom tools fire. Fix without touching nodes: re-attach the source WITH flow variables:
`POST /bot/{botId}/source/{sourceId}` body `{"tags":[],"tagFilterConfig":{"operator":"and","groups":[]},"channels":["SMS","FB","IG","Live_Chat"],"enabled":true,"flowVariableValues":{"source.calendar_id":"<calendarId>"}}`. Verify via `GET /bot/{id}` → `.sources[0].flowVariableValues`. (Setting it on the agency-source side did not propagate; the bot-side attach does.)

## Pitfalls

- `PUT /calendars/services/bookings`-style paths 404 with misleading "Please provide a valid service booking ID" — that message means the route doesn't exist; the real create route is `/calendars/services/bookings` POST.
- Booking pages served by a client's `links.<domain>` are GHL funnels; the useful ids in the URL are `locationId` + `serviceCategoryId` (the category slug shown in `sc/`).
- Calling GHL calendars for this location with a token minted for a different location 401s — tokens are location-locked; use the client's PIT (already embedded in the bot's GHL Custom Field tool headers) instead.
