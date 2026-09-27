# closebot-apply-template — splice mechanics

## Why this is safe to splice

Bots duplicated from one template **share identical node IDs**. So you add the reference's missing nodes
using their existing IDs (zero collision), and once added, **every ID in the
reference's edge set exists in the target** — meaning you can adopt the
reference `.edges` array **verbatim** and the wiring is guaranteed correct. No
hand-patching, no ID remapping.

## In-place upgrade pattern (proven 2026-06-22 on four client bots)

When the target is a thin client bot (or a fresh duplicate of one), the
cleanest upgrade is to **overlay your template bot's graph onto the target's
existing bot id** — no new bot, so the persona/source UI work isn't duplicated:

1. `cb bot pull "$CB_TEMPLATE_BOT" --out tpl.json` (reference, read-only) and
   `cb bot pull <TGT> --out tgt.json` (target's current draft — never hardcode
   a version on either side).
2. New steps = the template's `nodes` + `edges` (the rich agent flow), but
   `variables.business` = the **target's** verified identity (keep its
   calendar/offer narrative; detect shape by NON-EMPTY length, never
   key-presence — see `closebot-edit-job-flow/references/mutation-recipes.md`).
3. Rewrite every template Method `Sections[].Body` + `Instructions` and the "Handle
   Pricing" MultiObjective for the target's offer. NO template-client facts, NO invented
   prices.
4. Swap the template's calendar id → the target's calendar everywhere
   (field + inline + Instructions, whole-tree `walk()` — same pattern as the
   calendar-swap recipe in `closebot-edit-job-flow`); set it on every Method
   with `EnableGhlBooking:true`. If the target has no calendar yet, strip the
   id and set `EnableGhlBooking:false` so the graph still validates.
5. Deposit variant: client has a deposit → keep "Deposit Confirmation Agent",
   rewrite the amount; no deposit → retitle "Booking Readiness Agent" and gut
   all deposit/card language.
6. Leak-assert the whole payload = 0 for template-client facts (its brand
   name, staff/provider names, calendar id, deposit amount, services only it
   offers). **Sweep `variables.persona` too** — brand text hides in the
   persona block, outside nodes (live 2026-06-22).
7. Run the 5 pre-save validations (`closebot-edit-job-flow`), diff vs. the
   target's clean original, then `cb bot push <TGT> steps.json` and re-audit
   until `framework_parity.on_framework == true`.

## Diffing the target against the reference (read-only, Step 1 detail)

```bash
comm -13 <(jq -r '.nodes[].id' tgt.json | sort) <(jq -r '.nodes[].id' tpl.json | sort)
```
Report the missing-node list and the structural delta (node/edge counts)
before editing.

## Pulling the target client's REAL facts (Step 2 detail)

```bash
bash scripts/ghl-business-facts.sh "$TGT"   # name, address, phone, calendar candidates, custom values
```
NEVER carry the reference bot's calendar, address, phone, or hours across.

## Offer-specific forks to confirm with the user (Step 3 detail)

The reference's objection/pricing nodes are built around ITS offer (e.g.
a fixed booking deposit, a membership, a branded body-scan add-on). For the target, confirm:
- Does this client take a deposit? If no → strip ALL deposit language.
- Any offer-specific specifics to keep out (no invented prices — defer to KB).
- Bot name / persona (usually your standard persona; confirm).

## Building the merged draft (Step 4 detail)

Work from a freshly re-fetched clean target. Import the missing reference
nodes; **rewrite** the substantive ones (objection Method, pricing scenario)
for the client's offer with NO invented facts; copy `Statement` transfer nodes
verbatim (generic); adopt the reference `.edges`; set the client's
`GhlBookingCalendarId` on every Method with `EnableGhlBooking:true`; copy the
reference main-Method `ExitPaths` if the target's is empty (else the
exit/return edges dangle — see `exits-and-flow-connections.md`); swap Job
Information per the shape this family uses.

## Common pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| Copied the reference's objection CONTENT verbatim | Target quotes the reference client's deposit/prices/products | Copy structure + rules + tone only; rewrite every specific |
| Carried the reference calendar/address across | Target books into the wrong clinic | Pull the target's own facts from GHL; never reuse the reference's |
| Edited the wrong Job Information shape | Clean save but facts unchanged | Detect by NON-EMPTY length, not key-presence |
| Adopted reference edges but target main Method `ExitPaths:[]` | Exit/return edges dangle | Copy the reference main-Method `ExitPaths` too |
| Rewrote pre-existing inherited cruft unannounced | Scope creep; user loses trust | Flag inherited foreign-client text as a follow-up; don't silently rewrite outside agreed scope |
| Assumed Layer 1 = done | Test sessions fail `no_persona` | Layer 2 (UI persona assign) is required; flag it every time |
