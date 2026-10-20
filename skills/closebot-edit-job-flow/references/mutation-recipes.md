# closebot-edit-job-flow — mutation recipes

Every recipe below assumes `steps.json` was produced by `cb bot pull <id> --out steps.json`
and will be written back to the same path before `cb bot push <id> steps.json`.

## Swap a calendar ID everywhere

```bash
NEW_CAL="newCalendarId123"
OLD_CAL="$(jq -r '.nodes[] | select(.type=="Method") | .data.GhlBookingCalendarId' steps.json | head -1)"

jq --arg cal "$NEW_CAL" '
  .nodes |= map(
    if .type == "Method" then .data.GhlBookingCalendarId = $cal
    elif .type == "Booking" then .data.CalendarId = $cal
    else . end)
' steps.json > steps2.json && mv steps2.json steps.json

# The old id also hides in .data.Instructions ("Check availability on the calendar: <id>"),
# not just Sections[].Body — a live bot had it 10x: 4 fields, 3 in Section bodies, 3 in
# Instructions. Whole-tree walk so no string field is missed:
jq --arg old "$OLD_CAL" --arg new "$NEW_CAL" \
  'walk(if type=="string" then (split($old) | join($new)) else . end)' \
  steps.json > steps2.json && mv steps2.json steps.json

# Leak-assert BEFORE saving:
test 0 -eq "$(grep -oF "$OLD_CAL" steps.json | wc -l)" || echo "FAIL: old calendar id still present"
```

## Update a Method node's Instructions

```bash
jq --arg title "Lead Qualification" --arg ins "New instructions text..." '
  .nodes |= map(if .type == "Method" and .data.Title == $title then .data.Instructions = $ins else . end)
' steps.json > steps2.json && mv steps2.json steps.json
```

## Update a Section body

```bash
jq --arg nt "Lead Qualification" --arg st "Booking" --arg body "Updated section body..." '
  .nodes |= map(
    if .type == "Method" and .data.Title == $nt then
      .data.Sections |= map(if .Title == $st then .Body = $body else . end)
    else . end)
' steps.json > steps2.json && mv steps2.json steps.json
```

## Toggle a tool flag (all Method nodes, or one)

```bash
# all
jq '.nodes |= map(if .type == "Method" then .data.EnableEmail = false else . end)' \
  steps.json > steps2.json && mv steps2.json steps.json

# one node
jq --arg t "Lead Qualification" '
  .nodes |= map(if .type == "Method" and .data.Title == $t then .data.EnableSendPropertyImage = true else . end)
' steps.json > steps2.json && mv steps2.json steps.json
```

## Change tag taxonomy on a ModifyTags node

```bash
jq --arg t "human_handover" '
  .nodes |= map(
    if .type == "ModifyTags" and .data.Title == $t then
      .data.TagsToAdd = [{"Tag":"acme-handover"}] | .data.TagsToRemove = []
    else . end)
' steps.json > steps2.json && mv steps2.json steps.json
```

## Rename a node

```bash
jq --arg old "Old Name" --arg new "New Name" '
  .nodes |= map(if (.data.Title // "") == $old then .data.Title = $new else . end)
' steps.json > steps2.json && mv steps2.json steps.json
```

## Job Information ("Why the conversation is happening" / "Important business information")

These fields live under `variables.business`, NOT in any node. **Two storage shapes exist
across bot families — detect by NON-EMPTY length, never key-presence or `|type`** (a bot
can carry all four keys with `whyText`/`importantText` as empty strings while the real
content sits in `overallPromptSections`; presence/`type` both report `"string"`, so
key-based detection silently writes into the empty shape and leaves old facts live):

- **Shape A:** `variables.business.overallPromptSections[]`, each `{Id, Title, Body}`.
- **Shape B** (common in med-spa bots built from older templates): flat
  strings `variables.business.whyText` + `variables.business.importantText`.

```bash
jq -r '.variables.business
  | if (.overallPromptSections|length)>0 then "SHAPE A → edit overallPromptSections"
    elif ((.whyText|length)>0 or (.importantText|length)>0) then "SHAPE B → edit whyText/importantText"
    else "EMPTY (no Job Information set)" end' steps.json

# Shape B:
jq --arg why "…" --arg biz "…" \
  '.variables.business.whyText = $why | .variables.business.importantText = $biz' \
  steps.json > steps2.json && mv steps2.json steps.json

# Shape A:
jq --arg why "…" --arg biz "…" '
  .variables.business.overallPromptSections |= map(
    if .Title == "Why the conversation is happening" then .Body = $why
    elif .Title == "Important business information" then .Body = $biz
    else . end)
' steps.json > steps2.json && mv steps2.json steps.json
```

If this edit is part of repurposing a *duplicated* bot for a new client, use
`closebot-repurpose-bot` instead — it pulls the new client's real facts from GHL.

## Validation (run all 5 before every push)

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

## Don't drop UI-added cosmetic nodes

A UI autosave can add a node your pull predates (a stray canvas `rectangle`/sticky). If
`cb bot push` reports a `savedVersion` you didn't expect, or the target's version bumped
between pull and push, diff node lists before assuming your push is the whole story:

```bash
comm -13 <(jq -r '.nodes[].id' steps.json | sort) \
         <(cb bot pull <id> --version <newer_version> | jq -r '.nodes[].id' | sort)
```
Carry any UI-added nodes forward into `steps.json` before pushing — otherwise the push
deletes them.

## Common pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| Hardcoded a version | Edit lands on a stale/wrong version | Always use `cb bot version`/`cb bot pull`'s resolved target |
| `jq` filter mutates wrong nodes | Diff shows unexpected changes | Filter by `.data.Title`, not just `.type` |
| Edited a Sections array but changed its length | Save can fail validation | Each Section needs `{Title, Body}` at minimum |
| Calendar swap only touched the field + Section bodies | Inline `.data.Instructions` refs still name the OLD calendar | Whole-tree `walk()` gsub + leak-assert `grep -oF "$OLD_CAL"` == 0 |
| Detected Job-Info shape by key-presence/`\|type` | Wrote into empty `whyText`/`importantText`; no visible change | Detect by NON-EMPTY length; Shape A iff `overallPromptSections\|length>0` |
