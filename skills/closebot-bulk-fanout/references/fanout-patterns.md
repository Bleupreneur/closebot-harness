# Fan-out patterns (via `cb`)

## Pattern A — Inventory fan-outs (Tier 0, read-only — use freely)

### A1. Snapshot every source's KB size
```bash
for src in $(cb source get-source --json | jq -r '.[].sourceId'); do
  name=$(cb source get-source --json | jq -r --arg s "$src" '.[] | select(.sourceId==$s) | .name')
  attached=$(cb kb verify --source "$src" --json | jq -r '.attached')
  printf "%-30s attached: %s\n" "$name" "$attached"
done
```

### A2. Find every bot on a specific calendar
```bash
TARGET_CAL="oldCalendarId123"
for bot in $(cb bot list --json | jq -r '.[].id'); do
  cb bot pull "$bot" 2>/dev/null | jq -e --arg c "$TARGET_CAL" '
    .nodes[] | select(
      (.type == "Method" and .data.GhlBookingCalendarId == $c) or
      (.type == "Booking" and .data.CalendarId == $c)
    )' >/dev/null 2>&1 && echo "$bot"
done
```

### A3. Find every Method node with a specific tool flag on
```bash
for bot in $(cb bot list --json | jq -r '.[].id'); do
  matches=$(cb bot pull "$bot" 2>/dev/null | jq '[.nodes[] | select(.type=="Method" and .data.EnableEmail==true)] | length')
  [ "$matches" -gt 0 ] && echo "$bot — $matches Method nodes with EnableEmail=true"
done
```

### A4. Find every bot OFF the template framework
```bash
for bot in $(cb bot list --json | jq -r '.[].id'); do
  on=$(cb bot audit "$bot" --json 2>/dev/null | jq -r '.framework_parity.on_framework')
  [ "$on" = "false" ] && echo "$bot — FRAMEWORK GAP (splice via closebot-apply-template, ref: $CB_TEMPLATE_BOT)"
done
```
Or the fleet script directly: `bash scripts/cb-view-agents-fleet.sh | grep -E "FRAMEWORK GAP|FRAMEWORK"`.
Hand each gap to `closebot-apply-template` (reference = **your template bot
`$CB_TEMPLATE_BOT`**, never a thin starter bot).

## Pattern B — Tier 1 batched writes (dry-run at the jq layer, then execute)

### B1. Migrate every bot from an old calendar to a new one
```bash
OLD_CAL="oldCalendarId123"; NEW_CAL="newCalendarId456"

# Step 1 — candidates (Pattern A2 above), collect into CANDIDATES[]

# Step 2 — show the list + the exact field changes, get "PROCEED"

# Step 3 — execute one at a time
for bot in "${CANDIDATES[@]}"; do
  cb bot pull "$bot" --out "/tmp/$bot.json"
  jq --arg old "$OLD_CAL" --arg new "$NEW_CAL" '
    .nodes |= map(
      if .type == "Method" then
        .data.GhlBookingCalendarId = (if .data.GhlBookingCalendarId == $old then $new else .data.GhlBookingCalendarId end) |
        (.data.Sections // []) |= map(.Body = (.Body | (split($old) | join($new))))
      elif .type == "Booking" then
        .data.CalendarId = (if .data.CalendarId == $old then $new else .data.CalendarId end)
      else . end
    )' "/tmp/$bot.json" > "/tmp/$bot.mutated.json"
  cb bot push "$bot" "/tmp/$bot.mutated.json" && echo "✓ $bot" || { echo "✗ $bot — stopping"; break; }
done
```
Report: `{bot, savedVersion, landed}` per bot. Drafts only — publish each one
individually via `closebot-publish-safely`.

### B2. Add a Smart FAQ to every source
```bash
QUESTION="What is your refund policy?"
ANSWER="We offer a 30-day money-back guarantee. Contact billing@example.com."
# Show the question/answer, get "PROCEED", then:
for src in $(cb source get-source --json | jq -r '.[].sourceId'); do
  cb smartfaq post-smart-faq --body "{\"sourceId\":\"$src\",\"question\":\"$QUESTION\",\"answer\":\"$ANSWER\"}" \
    && echo "✓ $src"
done
```

### B3. Toggle a tool flag off across all bots
```bash
# Show intent, get "PROCEED", then:
for bot in $(cb bot list --json | jq -r '.[].id'); do
  cb bot pull "$bot" --out "/tmp/$bot.json"
  jq '.nodes |= map(if .type=="Method" then .data.EnableSendPropertyImage=false else . end)' \
    "/tmp/$bot.json" > "/tmp/$bot.mutated.json"
  cb bot push "$bot" "/tmp/$bot.mutated.json" && echo "✓ $bot" || { echo "✗ $bot — stopping"; break; }
done
```

## Pattern C — Tier 2 fan-out (NEVER auto-loop — list and stop)

### C1. List drafts ready to publish
```bash
cb bot list --json | jq -r '.[] | select(.name | contains("[DRAFT]")) | "\(.id)  \(.name)"'
echo "REFUSING to auto-publish. Each is a separate Tier 2 confirmation — invoke closebot-publish-safely per bot."
```

### C2. List library files to delete (don't loop the DELETE)
```bash
cb library get-files-2 --json | jq -r '.[] | select(.tags // [] | any(. == "TODO-delete")) | "\(.id)  \(.name)"'
echo "REFUSING to bulk-delete. Remove each with cb library delete-files --fileId <id> --confirm, one at a time."
```

## Pattern D — Per-lead operations across many leads

### D1. Toggle AI off for a batch of leads (Tier 1)
`cb lead get-lead-2` filters server-side only by `sourceId`/`leadId`/paging —
there's no server-side tag filter, so filter client-side against whatever
tag field `LeadListResultDto` exposes (check `schema/openapi.json`):
```bash
TARGET_LEADS=$(cb lead get-lead-2 --sourceId src_xxx --json | jq -r '.[] | select(.tags[]? == "manual-handover") | .id')
echo "$TARGET_LEADS" | head -20
echo "Count: $(echo "$TARGET_LEADS" | wc -l)"
# get "PROCEED", then:
for lead in $TARGET_LEADS; do
  cb lead put-ai-toggle --leadId "$lead" --body '{"enabled":false}' && echo "✓ $lead"
done
```

## Failure handling
- Print each error immediately — never suppress.
- **Stop the loop on the first `landed:false`** rather than continuing past
  a failure unattended; report what succeeded before the stop.
- Failed bots are left in their pre-mutation state (each save is atomic) —
  retry just those.

## Anti-patterns this skill refuses

| Request | Refusal |
|---|---|
| "Publish every draft" | Lists candidates, requires per-bot publish via `closebot-publish-safely` |
| "Delete every test bot" | Lists candidates, requires per-bot DELETE confirmation |
| "Top up credits for every account I see" | Billing is Tier 2, one at a time |
| "Loop through all bots and apply this change" with no dry-run | Always diff candidates first, get PROCEED, then execute |
