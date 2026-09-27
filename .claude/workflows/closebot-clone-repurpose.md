# Workflow: closebot-clone-repurpose (one-pass clone → re-point)

Take **any existing CloseBot bot**, understand it fully, then in one coordinated
operation **duplicate it and re-point the copy at a different client/offer**: swap the
business identity (both Job-Information shapes), swap **every** booking calendar id
(structured field *and* inline text), find/replace the old client name everywhere,
reconcile structural deltas (e.g. a deposit flow the new offer doesn't use), verify,
and hand to the gated publish.

This is the action companion to the read-only `closebot-view-agent` skill and the
`closebot-view-agents` fleet workflow. It builds on `closebot-repurpose-bot` (which
re-points a bot *someone already duplicated*) by adding the **duplicate step itself**
and a **mechanical-swap script** that does the parts find-and-replace-by-hand misses.

**Tier 1 — mutates a reversible draft.** The duplicate (`POST /bot/{id}/duplicate`)
creates a NEW bot, non-destructive to the source. The swaps land via
`POST /bot/{id}/save` on the duplicate's own draft. This workflow **never publishes**
(that's Tier 2, `closebot-publish-safely`) and **never deletes**.

> The harness Workflow runner is JS; this file is a documented spec + a shell helper
> the user (or an agent) runs directly. It is **not** auto-executed.

## When to use

- "clone [bot] for [new client] and update it for [offer]"
- "duplicate [bot] and re-point it at [client]'s NAD+ IV offer"
- "make a copy of [bot], swap the calendar to X and the name to Y"
- "stand up a new bot just like [bot] but for [different client]"

If the bot was **already duplicated** and just needs re-pointing, you can skip straight
to the `closebot-repurpose-bot` skill. If you only need to **read** a bot, use
`closebot-view-agent`. If you're **levelling up a diverged live bot** to match your
template (not cloning), use `closebot-apply-template`.

## The one-pass operation

```
            ┌──────────────────────────────────────────────────┐
            │ 1. VIEW the source (understand it in one pass)    │
            │    closebot-view-agent <source>  /  cb-view-agent │
            └───────────────────────┬──────────────────────────┘
                                    ▼
            ┌──────────────────────────────────────────────────┐
            │ 2. DUPLICATE + MECHANICAL SWAP   (the script)     │
            │    scripts/cb-clone-repurpose.sh                  │
            │      • POST /bot/{src}/duplicate → new bot id     │
            │      • resolve the new bot's own draft version    │
            │      • swap EVERY GhlBookingCalendarId            │
            │        (structured field + inline section text)   │
            │      • find/replace old client name everywhere    │
            │        (titles, Statements, Scenario Descriptions,│
            │         MultiObjective prose, prohibitedWords)    │
            │      • validate + POST /bot/{dup}/save            │
            └───────────────────────┬──────────────────────────┘
                                    ▼
            ┌──────────────────────────────────────────────────┐
            │ 3. MANUAL RECONCILIATION  (judgement, not regex)  │
            │    • rewrite why/important narrative for the offer│
            │      (closebot-repurpose-bot + ghl-business-facts)│
            │    • verify offer / pricing                       │
            │    • reconcile deposit flow (REWRITE+RETITLE the  │
            │      node's content; NOT edge surgery)            │
            │    • reassign the GHL source (OAuth-gated, UI)    │
            │    • ★ assign persona (UI only) — HARD GATE,      │
            │      blocks testing (no_persona = no reply)       │
            └───────────────────────┬──────────────────────────┘
                                    ▼
            ┌──────────────────────────────────────────────────┐
            │ 4. VERIFY + TEST → GATED PUBLISH                  │
            │    cb-view-agent <dup> → test (GET testSession,   │
            │    non-hanging) → closebot-publish-safely         │
            └──────────────────────────────────────────────────┘
```

## Step 1 — View the source (one-pass understanding)

Read the source completely before cloning so you know what you're carrying over and
what will need manual reconciliation (especially a deposit flow, multiple calendars,
or which Job-Information shape it uses):

```bash
bash scripts/cb-view-agent.sh <source_bot_id>
```

Note for the reconciliation step:
- **Job-Information shape** — A (`overallPromptSections[]`) vs B (`whyText`/`importantText`).
  Don't trust memory; the view auto-detects it. (Memory has been wrong here before —
  e.g. a bot believed to be Shape B was actually Shape A.)
- **Booking calendars** — how many distinct ids, and how many Method nodes carry one.
- **Deposit flow** — a "Deposit Confirmation Agent" Method node and "$ deposit required"
  language are a structural delta you'll reconcile by hand, not by regex.

## Step 2 — Duplicate + mechanical swap (the script)

`scripts/cb-clone-repurpose.sh` does the duplicate and every mechanical swap in one run.

```
bash scripts/cb-clone-repurpose.sh <source_bot_id> <new_bot_name> \
  [--ref <reference_bot_id>] \   # read the new calendar/offer facts from this bot (read-only)
  [--cal <new_calendar_id>] \    # explicit new calendar; overrides --ref's calendar
  [--old-name "X" --new-name "Y"] \  # find/replace old client/offer name everywhere
  [--dry-run]                    # preview + diff summary, save NOTHING, duplicate NOTHING
```

**Always dry-run first.** It prints the source inspection (calendars, shape, deposit
flow, name-hit count), shows what it *would* change, and saves nothing:

```bash
bash scripts/cb-clone-repurpose.sh "$CB_TEMPLATE_BOT" "Acme Med Spa - Booking Agent" \
  --ref bot_XXXXXXXXXXXXXXXX --cal <CALENDAR_ID> \
  --old-name "Old Brand Wellness" --new-name "Acme Med Spa" --dry-run
```

Then run it for real (duplicates the source, applies the swaps, saves the draft — still
does **not** publish):

```bash
bash scripts/cb-clone-repurpose.sh "$CB_TEMPLATE_BOT" "Acme Med Spa - Booking Agent" \
  --cal <CALENDAR_ID> \
  --old-name "Old Brand Wellness" --new-name "Acme Med Spa"
```

What the script swaps **mechanically** (and verifies on the saved version):
- **Every** `GhlBookingCalendarId` on Method nodes and `CalendarId` on Booking nodes.
- **Inline** calendar-id mentions inside section bodies / instructions (e.g.
  "Check availability on the calendar: <id>") — a field-only swap leaves these wrong.
- The old client/offer name across the **whole tree** (node Titles, Statement bodies,
  Scenario Descriptions, MultiObjective prose, `prohibitedWords`, section text).

What the script **deliberately does not do** (it prints these as MANUAL STEPS):
rewrite the business narrative for the new offer, verify pricing, reconcile a deposit
flow, reassign the GHL source, assign the persona (a **hard gate** — without it the
sandbox returns `no_persona` and the bot won't reply), or publish.

## Step 3 — Manual reconciliation (judgement, not regex)

The script gets you a clean, calendar-correct, name-correct draft. These remaining
items require real facts and structural edits:

### 3a. Rewrite the business narrative — use `closebot-repurpose-bot`
Find/replace swaps *names*, not *meaning*. The "Why the conversation is happening" and
"Important business information" still describe the old client's situation. Pull the
new client's real facts first — never invent address/provider/pricing:

```bash
bash scripts/ghl-business-facts.sh <new_bot_id>      # resolves the bot → its GHL location
```

Then let `closebot-repurpose-bot` swap the narrative into the correct shape
(A `overallPromptSections[]` or B `whyText`/`importantText`).

### 3b. Verify offer / pricing
Confirm the MultiObjective "Handle Pricing" objectives and the Method "Promotional
Offer of Interests" sections match the **new** offer. The source's offer/pricing text
survives find/replace untouched, so it will still quote the old offer until you fix it.

### 3c. **Decision point — deposit, yes or no?**
| Source has a deposit? | New offer has a deposit? | Action |
|---|---|---|
| No | — | nothing to do |
| Yes | Yes | keep the Deposit Confirmation node; verify the amount |
| Yes | **No** | **CONTENT REWRITE + RETITLE — NOT edge surgery.** Do *not* delete the "Deposit Confirmation Agent" node or rewire its edges. Rewrite its `Sections[].Body` + `Instructions` to the new offer's booking behaviour, retitle the node (`.data.Title`), and strip every "$ deposit required" mention from the why-text and all other Method sections. Leaving the edges intact keeps the flow valid. Use `closebot-edit-job-flow`. |

The first live test of this workflow was the "Yes → No" case: the source had a
flat booking deposit + a "Deposit Confirmation Agent" node; the new offer had none. The
fix that worked live was rewriting + retitling that node's content, **not** removing it.

### 3d. **Decision point — GHL source attachment** (highest-risk publish blocker)
A duplicate inherits the **source bot's** source attachment, so `{{location.*}}` merge
fields and live messaging resolve to the **wrong client** until reassigned. Adding or
binding a fresh GHL source is **OAuth-flow only and NOT API-callable** — do it in the CloseBot UI, then confirm:

```bash
bash scripts/ghl-business-facts.sh <new_bot_id>      # should now resolve to the NEW client's location
```

### 3e. ★ Persona — HARD GATE (blocks testing) + display name
**This is a hard gate, not a nicety.** A duplicate inherits a persona reference it
**cannot use**: the sandbox returns **`no_persona`** and the bot **won't reply at all**
until a persona is assigned. Persona assignment is **UI dropdown only** (no API;
`PUT /persona/{id}` has a destructive side-effect — see GOTCHAS.md). **Assign the persona
in app.closebot.com BEFORE Step 4's test** — testing without it is wasted effort. The
bot's display name is not carried by the steps API; rename in the UI if the duplicate
kept the source's name.

## Step 4 — Verify + test, then publish through the gate

```bash
bash scripts/cb-view-agent.sh <new_bot_id>           # full read-only audit + red-flag scan
```

Check the red-flag scan: no wrong-calendar nodes, no leftover old-client contradictions,
no orphaned deposit node, and **`✓ recommended agent-node set present`** (FRAMEWORK
PARITY, section 12h). A `⚠ FRAMEWORK GAP` is a BLOCKER, not a nicety.

> **Thin-source warning (root cause of the 2026-06-22 round-1 miss).** Cloning a client's
> OWN existing bot inherits whatever structure it had — if that bot is thin (≤2 Method
> nodes, no `Handle Pricing` MultiObjective), the clone is thin too, and identity/leak
> checks all pass while the core agents are missing. If the audit reports a FRAMEWORK
> GAP, bring the clone up to standard with `closebot-apply-template` (reference = **your
> template bot `$CB_TEMPLATE_BOT`**, never a thin starter bot). A rebuild is only done when
> `framework_parity.on_framework == true`.

> **Test only after the persona gate (3e) is satisfied** — otherwise the sandbox returns
> `no_persona` and the bot stays silent. For a **non-hanging** status check use
> `GET /bot/{id}/testSession` (reads `lastMessage` + `mostRecentFailureReason`, returns
> immediately). The test-session **listen endpoint is a long-poll** — never poll it bare;
> if you must hit it, bound it with `curl --max-time`.

**Then** publish — and only through the gate:

> **Publish decision point.** Publishing is Tier 2. Invoke the
> **`closebot-publish-safely`** skill, which re-runs pre-flight, diffs the draft against
> the current live version, refuses on non-empty `invalidPaths`, and demands same-turn
> confirmation. **Never** publish from the clone script or a raw `POST /bot/{id}/publish`.

## Decision points summary

| Decision | Where | Default / rule |
|---|---|---|
| New calendar id | Step 2 (`--cal` / `--ref`) | required for the swap; pull from the reference bot or GHL |
| Deposit: keep or rewrite | Step 3c | if new offer has no deposit → rewrite + retitle the node's content; do NOT delete the node or edit edges |
| GHL source reassignment | Step 3d | OAuth-gated, UI-only; blocks a correct publish |
| **Persona (hard gate)** | Step 3e | UI dropdown only; unassigned → `no_persona`, bot won't reply — **blocks testing** |
| Test status check | Step 4 | `GET /bot/{id}/testSession` (non-hanging); never bare-poll the long-poll listen endpoint |
| Publish | Step 4 | Tier 2 — `closebot-publish-safely`, same-turn confirmation, never chained |

## Safety notes

- **The script never publishes or deletes.** It is Tier 1. The only Tier-2 action in
  this workflow is the final publish, which goes through `closebot-publish-safely`.
- **Dry-run is free and read-mostly** (it does GETs only; it does not even duplicate).
  Use it to confirm the name/calendar hit counts before committing.
- **Concurrent-edit clobber.** If anyone has the new bot open in app.closebot.com, a UI
  autosave can silently overwrite the script's save. The script re-pulls the saved
  version and warns on a calendar mismatch — if it warns, have the user close the editor
  tab and re-run.
- **Spec drift.** If the duplicate or save returns an unexpected schema/404, re-fetch
  `schema/openapi.json` from upstream (`cb spec refresh`) before debugging.

## Related

| Need | Skill / file |
|---|---|
| Read/understand the source first | `closebot-view-agent` · `scripts/cb-view-agent.sh` |
| The mechanical clone+swap | `scripts/cb-clone-repurpose.sh` (this workflow's helper) |
| Rewrite the business narrative from real facts | `closebot-repurpose-bot` · `scripts/ghl-business-facts.sh` |
| Surgical single-property / node edits (deposit reconcile) | `closebot-edit-job-flow` |
| Pull the new client's GHL business facts | `scripts/ghl-business-facts.sh` |
| Publish the finished draft (Tier 2 gate) | `closebot-publish-safely` |
| View many bots at once | `.claude/workflows/closebot-view-agents.md` |
```
