# closebot-build-job-flow — structural patterns and node examples

## Structural patterns

Pick one based on PURPOSE + SUCCESS from the design Q&A.

### Pattern A — Lead qualification → booking
```
Source → Method (qualify, EnableUpdateContact, EnableAddTag, EnableSmartFaq)
       → Comparator (AI: qualified?)
         ├── true → Method (offer booking, EnableGhlBooking, EnableCheckAvailability)
         │           → Booking → Statement ("Confirmed!") → End
         └── false → ModifyTags (not-qualified) → End
+ ScenarioAggression → ModifyTags (handover) → End
+ ScenarioGoodbye → Statement → End
```

### Pattern B — FAQ deflection
```
Source → Method (answer from KB, EnableSmartFaq, EnableLibraryContext)
       → Comparator (AI: resolved?)
         ├── true → Statement ("Anything else?") → loop back
         └── false → ModifyTags (handover) → Method (collect contact) → End
+ ScenarioAggression → ModifyTags → End
```

### Pattern C — Appointment reminder + reschedule
```
Source → Method (confirm appt, EnableModifyAppointment)
       → Switch (AI: confirm | reschedule | cancel)
         ├── confirm → Statement ("See you then!") → End
         ├── reschedule → Method (EnableCheckAvailability + EnableGhlBooking) → End
         └── cancel → ModifyTags (cancelled) → End
```

### Pattern D — Multi-stage qualification with branching
```
Source → MultiObjective (capture name + need + urgency + budget)
       → Switch (AI: route by urgency)
         ├── high → Method (immediate booking, EnableGhlBooking)
         ├── medium → Method (nurture, EnableEmail) → End
         └── low → ModifyTags + End
```

### Pattern E — Custom
Compose from atomic nodes — see `docs/AGENT-BUILDING.md` §6 for more examples.

## Node `data` block examples

Every node needs at minimum:
```json
{ "id": "node_<uuid>", "type": "Method", "data": { /* type-specific */ }, "position": { "x": 100, "y": 200 } }
```
Generate ids: `NEW_ID="node_$(uuidgen | tr -d '-' | cut -c1-16 | tr '[:upper:]' '[:lower:]')"`.

Edges: `{ "id": "edge_<uuid>", "source": "node_a", "target": "node_b", "sourceHandle": "default" }`.
For Comparator/Switch, `sourceHandle` selects the branch: `"true"`/`"false"` for
Comparator, `"<case_name>"` for Switch — always set it or default routing fails.

**Method:**
```json
{
  "Title": "Lead Qualification",
  "Instructions": "You are a friendly assistant for {brand}. Your job is to...",
  "Sections": [{"Title": "Greeting", "Body": "..."}, {"Title": "Qualification", "Body": "..."}],
  "EnableUpdateContact": true, "EnableAddTag": true,
  "EnableCheckAvailability": false, "EnableGhlBooking": false, "GhlBookingCalendarId": "",
  "EnableSmartFaq": true, "EnableLibraryContext": true
}
```

**Comparator:**
```json
{ "Title": "Qualified?", "UseAI": true, "Condition": "The lead has clearly expressed interest in booking and provided their service of interest." }
```

**Booking:**
```json
{ "Title": "Book Appointment", "CalendarId": "abc123XYZ" }
```

**ModifyTags:**
```json
{ "Title": "Tag handover", "TagsToAdd": [{"Tag": "needs-human-handover"}], "TagsToRemove": [] }
```

**WebHook** — see `docs/playbooks/10-custom-webhook-node.md`.
**Scenario nodes** — see `closebot-add-scenario` skill.

## Validation (all 5 must pass before pushing)

```bash
test 0 -eq $(jq '.nodes | group_by(.id) | map(select(length > 1)) | length' steps.json) || echo "FAIL: duplicate IDs"
test 0 -eq $(jq '
  .nodes as $n | .edges | map(select(
    (.source as $s | ($n | map(.id) | index($s)) == null) or
    (.target as $t | ($n | map(.id) | index($t)) == null)
  )) | length' steps.json) || echo "FAIL: dangling edges"
test 0 -eq $(jq '.nodes | map(select(.type == "Booking" and (.data.CalendarId // "") == "")) | length' steps.json) || echo "FAIL: Booking without CalendarId"
test 0 -eq $(jq '.nodes | map(select(.type == "Method" and .data.EnableGhlBooking == true and (.data.GhlBookingCalendarId // "") == "")) | length' steps.json) || echo "FAIL: Method booking without calendar"
test 0 -lt $(jq '.nodes | map(select(.type == "Source")) | length' steps.json) || echo "FAIL: no Source node"
```

## Common pitfalls

| Pitfall | Avoid |
|---|---|
| Hand-crafting position coordinates that collide | Clone a skeleton, or lay out in `app.closebot.com` and export |
| Forgetting `sourceHandle` on Comparator/Switch edges | Always specify; default routing will fail |
| Method with `EnableGhlBooking:true` but blank `GhlBookingCalendarId` | Server rejects the path — always set the calendar id |
| Booking node with no preceding confirm step | Best practice: a Method must get explicit agreement before Booking fires |
| Flow with no `ScenarioAggression` | Real conversations hit it — always add one via `closebot-add-scenario` |
