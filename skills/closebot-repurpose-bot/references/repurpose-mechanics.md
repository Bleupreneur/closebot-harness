# closebot-repurpose-bot — mechanics

## The core insight

When a bot is duplicated, the copy carries the **source bot's content
verbatim** — including the human-written business identity ("Job
Information": the *Why the conversation is happening* / *Important business
information* the agency fills in per client). A bot duplicated from "Client A Lip
Filler" will happily tell the new client's leads to visit Client A's address, ask
for Client A's staff, and quote Client A's prices until you swap it.

## Where Job Information lives (the #1 miss)

Two shapes — check which is populated, detect by NON-EMPTY length never
key-presence (full recipe: `closebot-edit-job-flow/references/mutation-recipes.md#job-information`):
Shape A = `variables.business.overallPromptSections[]`; Shape B (common in
med-spa bots built from older templates) = flat
`whyText`/`importantText`. It is **NOT** in the Method node's `Sections[]` or
`Instructions` — those are the conversation flow, not the business identity.

**Source and reference can be DIFFERENT shapes.** When the user gives a
reference bot to mirror, the duplicate stays the SOURCE's shape — so if the
source is Shape A and the reference is Shape B, translate the reference's
`whyText`/`importantText` content INTO the duplicate's `overallPromptSections`.
Write into the DUPLICATE's shape, not the reference's.

## See the leftover data + pull the new client's real facts

```bash
cb bot pull <BOT_ID> --out steps.json
jq -r '.variables.business
  | if (.overallPromptSections|length)>0 then "SHAPE A"
    elif ((.whyText|length)>0 or (.importantText|length)>0) then "SHAPE B"
    else "EMPTY" end' steps.json
jq -r '.variables.business | {whyText, importantText, overallPromptSections}' steps.json

bash scripts/ghl-business-facts.sh "$BOT_ID"   # or a locationId; --json for a bundle
```
Cross-check pricing against what's already in the bot — a duplicated bot
usually has a `MultiObjective` "Handle Pricing" node with correct,
client-approved numbers (`jq '.nodes[] | select(.type=="MultiObjective") | .data.Objectives[]' steps.json`).
Prefer those; the GHL custom value is a confirmation, not an override. Only
write facts you verified — omitting a field beats shipping a wrong one.

## Whole-payload old-name swap + leak-assert

The old name leaks into more than the obvious places — on one client bot it
appeared 7×, 6 of those inside Method nodes (`Sections[].Body` and
`Instructions`), which a naive Statement/scenario-only scan missed entirely.

```bash
jq --arg old "Old Brand Wellness" --arg new "Acme Med Spa" \
  'walk(if type=="string" then (split($old) | join($new)) else . end)' \
  steps.json > tmp.json && mv tmp.json steps.json

# leak-assert: old name AND old calendar id must be 0 across the WHOLE file
test 0 -eq "$(grep -oF "Old Brand Wellness" steps.json | wc -l)" || echo "FAIL: old name still present"
```
Repeat for each old provider name and the old calendar id before saving.

## Structural delta: remove a flow the new offer doesn't have

A "no-deposit" repurpose (or any offer that drops a step the source had) is
**not** find-and-replace — it's a node-and-edge change. On one client bot the
deposit lived in THREE shapes at once: a dedicated Method node "Deposit
Confirmation Agent", the "Why the conversation is happening" text, and 5
Method Section bodies. Text edits alone ship a bot that still *runs* the
deposit node.

Two safe ways to neutralize the node:
- **Delete + splice** (preferred for a real branch): delete the node, re-wire
  its inbound edge straight to its outbound target, re-run the dangling-edge
  validation.
- **Retitle + gut** (zero edge surgery, used live on a client bot):
  keep the node, retitle `.data.Title` (e.g. "Booking Readiness Agent"), strip
  the deposit gate from `Sections`/`Instructions`.

Diff the duplicate's node set against the reference bot to confirm you removed
exactly the extra flow and nothing the new offer needs.

## Framework-parity gate (REQUIRED)

Identity-clean is NOT done. A repurpose that re-points a **thin** source bot
produces a thin result. After saving:
```bash
cb bot audit "$BOT_ID" --json | jq '.framework_parity'
```
`on_framework: false` → not on the recommended framework; do NOT report complete.
Bring it up to standard with `closebot-apply-template` (reference = your
template bot `$CB_TEMPLATE_BOT`, never a thin starter bot).

## Leak-assert against the real audit fields

`cb bot audit --json` has no `.leaks` key — cross-check `.job_information` and
`.method_nodes` against a grep for the OLD client's facts over the pulled
`steps.json`:
```bash
cb bot audit "$BOT_ID" --json | jq '.job_information, .method_nodes'
grep -ciE "$OLD_NAME|$OLD_CALENDAR|\\\$$OLD_PRICE" steps.json   # expect 0
```

## The two duplicate-only publish blockers

1. **Persona gate** — a fresh duplicate inherits an unusable persona
   reference; sandbox returns `mostRecentFailureReason: "no_persona"` and the
   bot won't reply until a persona is assigned in the UI (`PUT /persona/{id}` has
   an irreversible default-flip side effect — UI dropdown only). Check without
   hanging: `GET /bot/{id}/testSession`, never call the raw
   `…/testSession/messages/{leadId}` long-poll directly.
2. **Source still points at the OLD client** — a duplicate inherits the
   SOURCE bot's attached GHL source, so `{{location.*}}` and live routing
   resolve to the wrong client until reassigned — OAuth-only, not
   API-callable.

## Common pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| Edited the Method node's `Sections`/`Instructions` | Wrong-client address/staff still live | Job Information is in `variables.business`, not the Method node |
| Edited the wrong Job-Info shape | Clean save, old facts stay live | Detect by NON-EMPTY length; Shape A iff `overallPromptSections\|length>0` |
| Invented address/staff | Plausible but wrong facts shipped | Pull from GHL via `ghl-business-facts.sh`; omit what you can't verify |
| Treated deposit removal as text-only | Bot still runs the Deposit node | Structural delta: delete+splice or retitle+gut the node |
| Residual-name scan skipped Method nodes | Old brand mid-flow despite a "clean" swap | Whole-tree `walk()` swap + leak-assert old name/calendar == 0 |
| Tried to sandbox-test a fresh duplicate | `no_persona` failure / long-poll hang | Persona is a UI-only hard gate before testing |
| Published with source still on old client | `{{location.*}}` resolves to wrong client live | Reassign the GHL source in the UI first |
| GHL location "not accessible from this token" | 401/403 pulling client facts | Broker's install list is stale — the script's warm-all retry fixes it |
