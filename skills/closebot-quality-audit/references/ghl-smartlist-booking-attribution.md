# GHL Smart List → Booking Attribution

Use this workflow to audit whether a tagged lead cohort booked, how quickly they booked, and which calendar received the appointment. Proven against a HIPAA-enabled GHL location where conversation history was restricted but appointment reads were available.

## Inputs

- `locationId`
- Smart List URL/ID or its known filter (for example, exact tag `agency-lead`)
- The calendar class to attribute against (for example, current `service_booking` calendars)
- Account timezone from `GET /locations/{locationId}`

## Reliable extraction workflow

### 1. Reproduce the Smart List filter through Contact Search

The public API does not need the saved Smart List ID when the filter is known. Use:

```http
POST /contacts/search
Version: 2021-07-28

{
  "locationId": "LOCATION_ID",
  "page": 1,
  "pageLimit": 100,
  "filters": [
    {"field": "tags", "operator": "contains", "value": "agency-lead"}
  ],
  "sort": [{"field": "dateAdded", "direction": "desc"}]
}
```

Paginate until the accumulated contacts reach the response `total`. Because `contains` may be broader than intended, apply a client-side exact guard before reporting:

```python
any(str(tag).strip().lower() == "agency-lead" for tag in contact.get("tags", []))
```

Deduplicate by contact ID.

### 1A. Meta ad exports: consolidate and match before appointment reads

For Meta lead-export folders, treat every creative file as part of the source cohort unless the user explicitly narrows to one creative. Report both the overall total and a per-ad breakdown so a dominant creative does not hide the others.

Files named `.csv` may actually be **UTF-16LE tab-delimited** exports. Detect the BOM/encoding first; a reliable Python reader is:

```python
with open(path, encoding="utf-16", newline="") as f:
    rows = list(csv.DictReader(f, delimiter="\t"))
```

Deduplicate across files by Meta lead `id`. Match each lead to GHL with email and phone together:

```bash
ghl contacts get-duplicate --email "$EMAIL" --number "$PHONE"
```

Fall back to advanced contact search only when duplicate lookup fails. Track these independently:

- Exported leads
- Matched GHL contacts
- Unmatched leads
- Matched contacts carrying the expected attribution tag (for example exact `agency-lead`)

A matched contact missing the attribution tag is an **integration/attribution finding**, not an unmatched lead. Include a dedicated missing-tag review sheet or table.

For Meta cohorts, calculate time to book from Meta `created_time` to appointment `dateAdded`; retain GHL contact `dateAdded` separately when useful for diagnosing ingestion delay.

### 2. Inventory calendars before classifying bookings

Call `GET /calendars/` and build separate maps for:

- `calendarType == "service_booking"`
- `calendarType == "personal"`

Do not assume every returned appointment belongs to a currently listed calendar. GHL may return appointments tied to deleted, migrated, legacy, or otherwise hidden calendar IDs.

### 3. Read appointments per contact

Call:

```http
GET /contacts/{contactId}/appointments
```

This requires `contacts.readonly`. On tested HIPAA-enabled locations it returned appointment records even though direct conversation-message history was blocked.

Ignore events with `deleted: true`. Keep all appointments for auditability, then sort by `dateAdded` (fallback to `startTime`).

### 4. Compute booking timing correctly

Distinguish these timestamps:

- **Contact created:** contact `dateAdded`
- **Booked at:** appointment `dateAdded`
- **Appointment date:** appointment `startTime`

Compute:

```text
time_to_book = appointment.dateAdded - contact.dateAdded
```

GHL contact timestamps are normally ISO/UTC. Appointment timestamps from the contact-appointments endpoint can be location-local strings without an offset. Resolve the location timezone first and localize those timestamps before subtraction. Never use appointment `startTime` as “booked at.”

### 5. Classify appointments without losing attribution

Use mutually exclusive classes for the first appointment:

1. **Active service calendar** — ID exists in current `service_booking` map
2. **Personal/consultation calendar** — ID exists in current personal map
3. **Legacy/other calendar** — appointment exists but calendar ID is absent from both maps
4. **No appointment** — endpoint returned no active events

A legacy/other appointment is **booked**, not unbooked. Report it separately as a configuration/attribution gap. This distinction prevents materially understating the booking rate.

Useful headline metrics:

- Total cohort contacts
- Any-appointment contacts and rate
- Active-service-calendar contacts and rate
- Personal/consultation count
- Legacy/other count
- No-appointment count
- Median and average time to any booking
- Status counts (`confirmed`, `showed`, `noshow`, `cancelled`)
- Appointment-read error count

### 6. Build the review artifact

For each contact include:

- Name as a clickable direct link
- Created timestamp
- Booked? / calendar classification
- Time to book
- Booked-at timestamp
- Appointment date
- Calendar name or legacy calendar ID
- Appointment status

Direct contact link pattern:

```text
https://app.gohighlevel.com/v2/location/{locationId}/contacts/detail/{contactId}
```

Put booked contacts in a short table first, followed by the complete cohort. Include links to the original Smart List and Service Calendars page. A CSV companion is useful for sorting/filtering.

## Verification

Before delivery, verify all of the following:

- API cohort count matches the filtered total after exact-tag guard and deduplication
- Appointment reads completed for every contact, or errors are counted explicitly
- Current service calendar IDs came from a fresh calendar list
- For high-confidence audits, cross-check current calendar events over the relevant date window against the matched contact IDs; this validates active-calendar results while contact appointment reads remain authoritative for legacy calendar events
- “Booked at” uses appointment `dateAdded`, not appointment start
- Timezone handling is explicit
- Legacy/other appointments are not counted as unbooked
- Every contact row has a direct GHL link
- Generated document opens cleanly and contains clickable links

## Privacy

Appointment titles can contain names and service details. Treat the output as PHI-capable data: minimize fields, avoid copying patient names into chat summaries, and mark downloadable reports for secure handling.
