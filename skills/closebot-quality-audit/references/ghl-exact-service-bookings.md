# GHL Exact Service-Menu Booking Verification

Use this when a CloseBot/GHL audit must identify the exact booked service, but public `GET /calendars/` exposes only generic calendars.

## Validated read path

1. Get a location-scoped OAuth bearer (e.g. from your GHL Marketplace app or agency token exchange); never print or persist it.
2. List exact service definitions:

```http
GET https://backend.leadconnectorhq.com/calendars/services/all?locationId=<LOCATION_ID>
Authorization: Bearer <LOCATION_OAUTH_TOKEN>
Version: 2021-07-28
```

Fields: `_id`, `name`, `serviceCategoryId`, `payment.amount`, `isActive`, `isServiceAvailable`, `teamMembers[].id`.

3. Select the target category and build a set of exact service IDs.
4. Query events by every distinct assigned user ID:

```http
GET https://backend.leadconnectorhq.com/calendars/events?locationId=<LOCATION_ID>&userId=<USER_ID>&startTime=<EPOCH_MS>&endTime=<EPOCH_MS>
Authorization: Bearer <LOCATION_OAUTH_TOKEN>
Version: 2021-07-28
```

5. Merge/dedupe events by event `id`, then filter where `calendarId` is an exact selected service ID and `deleted != true`.
6. Resolve `contactId` only if person-level detail is explicitly requested. Keep patient/service-linked PHI outside git and durable memory.

## Reporting rules

- Appointment-period reports use `startTime`.
- Time-to-book uses `dateAdded`.
- Separate gross, non-cancelled, confirmed, showed, no-show, and cancelled counts.
- Include zero-booking services.
- Preserve GHL status; do not infer attendance from elapsed time.

## Proven example

On 2026-08-17, a client location (`<LOCATION_ID>`) exposed 8 public service calendars but 102 internal service-menu definitions. IV Hydration category `<CATEGORY_ID>` contained 33 exact services. Querying assigned user `<USER_ID>` surfaced exact service bookings missed by the generic public-calendar approach.

## Pitfalls

- Querying `/calendars/events?calendarId=<service-menu-id>` can return `Calendar not found`; use assigned `userId`, then filter.
- Internal event reads require `locationId` in the query with a location-scoped OAuth bearer.
- A user-attached SVG may be only a UI icon/drag handle. Inspect SVG source before treating it as a screenshot.
