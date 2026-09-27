# closebot-debug-bot — decision tree, red herrings, and jq fix recipes

## Diagnosis decision tree

```
User report: "Bot is broken"
│
├─ Bot doesn't respond at all?
│   ├─ Check 1 (sources attached? persona attached?)
│   ├─ Check 10 (credits, account limits)
│   └─ Check 8 (recent leads — ai toggled off?)
│
├─ Bot responds but ignores knowledge?
│   ├─ Check 2 (files actually attached to source?)
│   ├─ Check 3 (KB tool flags on Method nodes?)
│   ├─ Account-level Smart FAQ tool enabled?
│   └─ Reproducing in a testSession? Check 9's zero-tool-call branch —
│       no `mimicSourceId` set, or a blank Job Info line, not a real gap
│
├─ Sandbox deflects with zero tool calls in `tools`?
│   └─ Check 9 (mimicSourceId on the testSession + blank Job Info fields —
│       this is prompt-steering, not a missing fact)
│
├─ Bot mentions wrong brand / old client?
│   └─ Check 5 (grep for old brand in prompts)
│
├─ Bot books wrong calendar?
│   └─ Check 4 (calendar IDs across nodes + inline)
│
├─ Bot can't book at all?
│   └─ Check 6 (booking-related tool flags)
│
├─ Bot ends conversations too early?
│   └─ Check 7 (scenario nodes — especially Goodbye)
│
└─ "Something feels off"?
    ├─ Check 1 (live vs draft version drift)
    └─ Check 8 (look at the lead's lastMessage/lastMessageDirection)
```

## Common red herrings

| User says | Often actually is |
|---|---|
| "Bot ignores the KB" | KB files uploaded but not attached to source (Check 2) |
| "Bot books wrong calendar" | Calendar ID in section body text wasn't swapped (Check 4) |
| "Bot still says [old brand]" | Multi-section prompts have brand in 3-5 places, only one was updated (Check 5) |
| "Bot stopped working today" | Out of credits (Check 10) |
| "Bot won't reply to this one lead" | `aiEnabled: false` on that lead's instance (Check 8) |
| "I made changes but nothing changed" | Edits saved as draft but never published (Check 1 — live vs draft version) |
| "Bot doesn't qualify / never asks for the booking / has no pricing brain" | Bot is structurally thin — missing the recommended agent nodes. Check `framework_parity.on_framework`; if false, splice via `closebot-apply-template` (ref: your template bot `$CB_TEMPLATE_BOT`) |
| "I added the KB but it still says 'not sure' in my sandbox test" | The testSession has no `mimicSourceId` set — it never had source context to retrieve from (Check 9's zero-tool-call branch), not a real KB gap |

## Fix recipe: wrong calendar in a Method's Section body

`cb bot audit <id> --json` surfaces each Method's `calendar` field and full
`sections[].Body` text, so you can spot a hardcoded old calendar id by eye.
To fix it once you've confirmed the old/new ids:

```bash
cb bot pull <BOT_ID> --out steps.json
OLD_CAL="oldCalendarId"; NEW_CAL="newCalendarId"
jq --arg old "$OLD_CAL" --arg new "$NEW_CAL" '
  .nodes |= map(
    if .type == "Method" then
      .data.GhlBookingCalendarId = (if .data.GhlBookingCalendarId == $old then $new else .data.GhlBookingCalendarId end) |
      .data.Sections = (.data.Sections | map(.Body = (.Body | gsub($old; $new))))
    elif .type == "Booking" then
      .data.CalendarId = (if .data.CalendarId == $old then $new else .data.CalendarId end)
    else . end
  )
' steps.json > steps2.json && mv steps2.json steps.json
cb bot push <BOT_ID> steps.json
```
Then verify via `closebot-publish-safely` before it reaches leads.

## Fix recipe: stale brand / leftover client name

Find every node still mentioning the wrong brand:

```bash
cb bot pull <BOT_ID> --out steps.json
WRONG="Old Brand Wellness"   # or whatever the user reports the bot saying
jq --arg w "$WRONG" '
  .nodes | map(select(
    .type == "Method" and (
      (.data.Instructions // "" | contains($w)) or
      (.data.Sections // [] | map(.Body // "" | contains($w)) | any) or
      (.data.Title // "" | contains($w))
    )
  )) | map({id, title: .data.Title})
' steps.json
```
Rewrite each returned node's text, then `cb bot push <BOT_ID> steps.json`.

## Fix recipe: booking tool flags

```bash
cb bot pull <BOT_ID> --out steps.json
jq '.nodes |= map(
  if .type == "Method" then
    .data.EnableLibraryContext = true |
    .data.EnableSmartFaq = true
  else . end
)' steps.json > steps2.json && mv steps2.json steps.json
cb bot push <BOT_ID> steps.json
```

`EnableGhlBooking: true` with an empty `GhlBookingCalendarId` is also a
server-validation failure — it would show up in `invalidPaths` on the push.
`EnableCheckAvailability: false` with `EnableGhlBooking: true` means the bot
can book but can't check first, and often fails to find a slot.

## No full conversation-history endpoint

There is no `GET /lead/{leadId}/messages` in the CloseBot REST spec — the
`LeadDto` only carries `lastMessage`/`lastMessageDirection`/
`lastMessageChannel`/`mostRecentFailureReason`. There's no API path to a full
transcript; use `cb bot test` to reproduce the failing turn instead of
hunting for history that isn't exposed.
