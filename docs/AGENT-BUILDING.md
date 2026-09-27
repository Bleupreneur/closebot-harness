# Agent building — job flows, nodes, tools

How to build, edit, and validate CloseBot agents from the API. Covers the job-flow model, every one of the 27 atomic node types, the 5 account-level tools, common patterns, validation, and publishing.

Companion to [`CLIENT-MANAGEMENT.md`](./CLIENT-MANAGEMENT.md) (lifecycle) and [`playbooks/12-onboard-new-client.md`](./playbooks/12-onboard-new-client.md) (end-to-end recipe).

---

## 1. The job-flow model

A CloseBot agent is a **directed graph** of nodes and edges. When a message comes in:

1. The conversation enters at the `Source` node.
2. The current node's logic runs (says something, branches, calls a webhook, etc.).
3. Edges decide where to go next based on output handles.
4. Repeat until an `End` node is reached or the conversation pauses waiting for the user.

The complete graph is what `GET /bot/{id}/steps` returns:

```json
{
  "nodes": [ { "id": "...", "type": "Method", "data": { ... }, "position": {...} }, ... ],
  "edges": [ { "id": "...", "source": "nodeId", "target": "nodeId", "sourceHandle": "..." }, ... ],
  "variables": [ { "name": "...", "type": "..." }, ... ],
  "customTools": [ ... ],
  "enabledGlobalToolNames": [ "SmartFAQ", "Email", ... ]
}
```

You edit this JSON, save it back, then publish. The full edit loop is in [`CLIENT-MANAGEMENT.md` §6](./CLIENT-MANAGEMENT.md#6-adjusting-a-single-clients-bot-without-duplicating).

A verified-real reference payload: pull your own template bot's steps (`GET /bot/{id}/steps?botVersion=<ver>` or `cb bot pull <id>`); set it once as `$CB_TEMPLATE_BOT` or `cb.config.json` → `templateBot`.

The full machine-readable node schema (all properties, types, defaults): [`schema/node-descriptors.json`](../schema/node-descriptors.json).

---

## 2. All 27 node types

Grouped by the same categories the CloseBot UI uses.

### Say Something — nodes that talk to the lead

| Node (`type`) | Display | What it does |
|---|---|---|
| `Method` | **Agent** | The workhorse. Accomplishes any combination of tasks via an LLM with tool access. 95% of bot logic lives in these. Configured with `Instructions`, `Sections[]`, and `EnableXxx` tool flags. |
| `Conversation` | **Conversation** | Open-ended chat — keeps replying using the knowledge library until the lead disengages or a transition fires. |
| `Statement` | **Statement** | Send one specific message, then move on. No LLM call. Use for canned responses, confirmations. |
| `Objective` | **Objective** | Conversationally determine one specific objective (e.g., "is this lead ready to book?"). Outputs true/false. |
| `MultiObjective` | **Objective (multi)** | Gather multiple pieces of information from a lead in one go, optionally updating CRM fields when finished. Replaces multiple back-to-back `Objective` nodes. |
| `End` | **Stop Responding** | Ends the conversation without sending a message. Terminator for paths that should just go silent. |

### Branch — conditional routing

| Node (`type`) | Display | What it does |
|---|---|---|
| `Switch` | **Switch** | Route to one of N paths. With "Use AI" off: deterministic condition on a variable. With "Use AI" on: LLM chooses the path based on conversation state. |
| `Comparator` | **True/False** | Two-way branch (green = true, red = false). With "Use AI" off: deterministic comparison. With "Use AI" on: LLM evaluates the condition. |

### Delay — pause execution

| Node (`type`) | Display | What it does |
|---|---|---|
| `Delay` | **Delay (time)** | Wait a fixed amount of time before continuing. Good for "let me think about it" → follow up in 2 hours. |
| `DelayVariable` | **Delay (variable)** | Wait until a specific variable on the source becomes non-blank. Useful for waiting on an external event (e.g., GHL contact field updated). |

### Integrations — external systems

| Node (`type`) | Display | What it does |
|---|---|---|
| `Booking` | **Booking** | Conversationally book an appointment on a GHL calendar. Configured with `CalendarId`. |
| `ModifyTags` | **Modify Tags** | Add/remove tags on the contact. `TagsToAdd: [{Tag: "..."}]`, `TagsToRemove: [{Tag: "..."}]`. |
| `SetField` | **Set Field** | Write a value to a GHL custom field. |
| `SaveConversation` | **Save Conversation** | Summarize the conversation up to this point and save the summary to the CRM. |
| `WebHook` | **Custom WebHook** | Send a GET/POST to any URL, optionally using the response in later nodes. The escape hatch for any integration that's not built in. Full reference: [`playbooks/10-custom-webhook-node.md`](./playbooks/10-custom-webhook-node.md). |
| `AiRequest` | **AI Request** | Send a custom prompt to the LLM mid-flow and capture the output to a variable. Use for classification, extraction, summarization steps. |

### Other — utility

| Node (`type`) | Display | What it does |
|---|---|---|
| `CheckDistance` | **Check Distance** | Use Google Distance Matrix to compute driving distance/time between two addresses. Useful for service-area qualification. |
| `VerifyAddress` | **Verify Address** | Validate an address, returning a property ID if it's a real address. |
| `GetPropertyDetails` | **Get Property Details** | Fetch beds, baths, square footage, etc. for a property. Real-estate-specific. |
| `GenerateStreetView` | **Generate Street View** | Generate a Street View image URL for an address. |

### Scenarios — interrupts that override the main flow

These don't appear in the main path — they're attached at the top level and fire whenever their condition is detected, no matter where the conversation currently is.

| Node (`type`) | Display | What it does |
|---|---|---|
| `ScenarioAggression` | **Aggression Detected** | Jump to a different flow when the lead is hostile. Typically tags `human_handover` + ends. |
| `ScenarioBotDetection` | **Bot Detected** | Jump when the lead seems to be another AI. Typically ends silently. |
| `ScenarioGoodbye` | **Goodbye Detected** | Jump when the lead says goodbye. Send a polite signoff, end. |
| `ScenarioCustom` | **Custom Scenario** | Jump on any user-defined detection condition. Define the trigger in plain English. |

### Structural — graph plumbing

| Node (`type`) | Display | What it does |
|---|---|---|
| `Source` | **Source** | Always present. Entry point of the graph. One per bot. |
| `Splitter` | **Splitter** | Fan-out — branch the same conversation into multiple parallel paths. Rarely used. |
| `VariableEdit` | **Variable Edit** | Set/modify a flow variable without an LLM call. |

---

## 3. The `Method` (Agent) node in depth

This is the node you'll spend 90% of your editing time on. Anatomy:

```json
{
  "id": "node_xxx",
  "type": "Method",
  "data": {
    "Title": "Lead Qualification",
    "Instructions": "You are an SMS-friendly med-spa assistant for Acme. Your job is to qualify the lead, gather their concern, and offer to book a consultation. Plain text only, no symbols.",
    "Sections": [
      {
        "Title": "Greeting",
        "Body": "If this is the first message, greet warmly using their first name."
      },
      {
        "Title": "Qualification",
        "Body": "Find out (1) what service they're interested in, (2) urgency, (3) where they heard about us."
      },
      {
        "Title": "Booking",
        "Body": "Once qualified, offer to check availability. Must clearly agree to a time before calling EnableGhlBooking. Calendar: abc123XYZcalendar."
      }
    ],
    "EnableUpdateContact": true,
    "EnableAddTag": true,
    "EnableCheckAvailability": true,
    "EnableGhlBooking": true,
    "GhlBookingCalendarId": "abc123XYZcalendar",
    "EnableModifyAppointment": true,
    "EnableSmartFaq": true,
    "EnableEmail": false,
    "EnableLibraryContext": true,
    "EnabledCustomTools": []
  }
}
```

### Properties you'll edit most often

| Property | Type | What it controls |
|---|---|---|
| `Instructions` | string | The top-level system prompt for this node. |
| `Sections[]` | array of `{Title, Body}` | Sub-prompts organized by topic. Easier to maintain than one giant `Instructions`. |
| `EnableUpdateContact` | bool | Allow the agent to update GHL contact fields (name, email, etc.). |
| `EnableAddTag` | bool | Allow the agent to add tags. |
| `EnableCheckAvailability` | bool | Allow checking GHL calendar availability. |
| `EnableGhlBooking` | bool | Allow booking a calendar slot. Requires `GhlBookingCalendarId`. |
| `EnableModifyAppointment` | bool | Allow rescheduling existing appointments. |
| `EnableSmartFaq` | bool | Allow searching the Smart FAQ KB attached to the source. |
| `EnableLibraryContext` | bool | Allow pulling from library files attached to the source. |
| `EnableEmail` | bool | Allow sending emails (requires account-level Email tool also enabled). |
| `EnableCheckDistance` | bool | Allow distance calculation (Google Distance Matrix). |
| `EnableGetPropertyDetails` | bool | Real-estate property lookup. |
| `EnableSendPropertyImage` | bool | Send property image URLs. |
| `GhlBookingCalendarId` | string | Which GHL calendar to book against. |
| `EnabledCustomTools` | array | List of custom-tool names available to this node. |

### Tool-flag presets by industry

| Tool | Med spa | Real estate | Gym | Service biz |
|---|:-:|:-:|:-:|:-:|
| `EnableUpdateContact` | ✓ | ✓ | ✓ | ✓ |
| `EnableAddTag` | ✓ | ✓ | ✓ | ✓ |
| `EnableCheckAvailability` | ✓ | ✓ | ✓ | ✓ |
| `EnableGhlBooking` | ✓ | ✓ | ✓ | ✓ |
| `EnableModifyAppointment` | ✓ | — | ✓ | ✓ |
| `EnableGetPropertyDetails` | — | ✓ | — | — |
| `EnableSendPropertyImage` | — | ✓ | — | — |
| `EnableCheckDistance` | optional | ✓ | — | optional |
| `EnableSmartFaq` | ✓ | ✓ | ✓ | ✓ |
| `EnableEmail` | optional | ✓ | — | optional |
| `EnableLibraryContext` | ✓ (if KB) | ✓ (if KB) | ✓ (if KB) | ✓ (if KB) |

---

## 4. Account-level tools (the 5)

Configured per bot via `POST /bot/{id}/saveTools`. Body is a **raw JSON array**, not wrapped in an object.

| Tool (`type`) | What it does |
|---|---|
| `SmartFAQ` | Captures unanswered questions from leads into the Smart FAQ KB. Builds your KB automatically over time. |
| `Email` | Allows the bot to send emails to the lead. Options: `AdditionalPrompt` to bias style. |
| `SummarizeConversation` | At conversation end, save a summary to the CRM. Options: `OutputVariable` to write to a custom field. |
| `TranscribeConversation` | Save the full transcript to the CRM. |
| `SmartFollowUp` | Set a follow-up time based on conversation context. |

Example: enable Smart FAQ + Email + Summary, disable transcript and follow-up:

```bash
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '[
    {"type":"SmartFAQ","enabled":true,"options":{}},
    {"type":"Email","enabled":true,"options":{"AdditionalPrompt":"Concise. Match brand voice."}},
    {"type":"SummarizeConversation","enabled":true,"options":{"OutputVariable":null}},
    {"type":"TranscribeConversation","enabled":false,"options":{}},
    {"type":"SmartFollowUp","enabled":false,"options":{}}
  ]' \
  "https://api.closebot.com/bot/$BOT_ID/saveTools"
```

**Gotcha:** if you wrap the body as `{tools: [...]}` it returns 400. Always send the raw array. See [`skills/learned/rest-api-spec-drift/`](../skills/learned/rest-api-spec-drift/) for why this drifts from the OpenAPI spec.

---

## 5. The edit loop (from API call to live bot)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. GET /bot/{id}/steps?botVersion=$VER      → /tmp/steps.json   │
│    ($VER = .target from `cb bot version <id>`, highest semver)   │
│ 2. mutate with jq / editor                                        │
│ 3. POST /bot/{id}/save  body={botSteps: steps.json}              │
│    → response.invalidPaths MUST be []                            │
│ 4. test: POST /bot/{botId}/testSession (+ mimicSourceId)         │
│ 5. POST /bot/{id}/publish    ← Tier 2, requires confirmation     │
│ 6. verify + check version→channel assignment in UI (unverified)  │
└──────────────────────────────────────────────────────────────────┘
```

### Step 1 — Pull current steps

```bash
# Resolve the edit target: the HIGHEST SEMVER version. Never hardcode 0.0.1, and never pick
# "last unpublished", because once the head is published that returns a stale old draft (GOTCHAS 2026-07-02).
VER=$(cb bot version "$BOT_ID" | jq -r .target)   # prints {target, targetPublished, live, liveEqualsTarget}
# Raw-HTTP equivalent: curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$BOT_ID" \
#   | jq -r '.versions | sort_by(.version | split(".") | map(tonumber)) | last | .version'
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BOT_ID/steps?botVersion=$VER" > /tmp/steps.json
```

**Always pass `botVersion` even though the OpenAPI says it's optional.** Without it, you get a 400. This is documented spec drift. `/save` (Step 3) has no version param — it writes to the latest version, so editing the wrong one means your changes never reach the live bot.

### Step 2 — Mutate

Use `jq` for surgical edits, an editor for prose changes. Examples in [`CLIENT-MANAGEMENT.md` §6](./CLIENT-MANAGEMENT.md#6-adjusting-a-single-clients-bot-without-duplicating).

### Step 3 — Save

```bash
jq '{botSteps: .}' /tmp/steps.json | curl -s -X POST \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  --data-binary @- \
  "https://api.closebot.com/bot/$BOT_ID/save"
```

Response shape:

```json
{
  "version": "0.0.1",
  "invalidPaths": [],
  "message": ""
}
```

`invalidPaths: []` → all nodes validated, draft saved. Non-empty → those nodes failed and were dropped. Common causes: typo in an `EnableXxx` flag name, malformed `Sections` array, missing required property (e.g., `Booking` node without `CalendarId`).

### Step 4 — Test before publishing

Test in an isolated **test session**, never through the live message endpoint. `POST https://api.closebot.ai/message` sends a real reply into a real channel, and a made-up `id` can resolve to a real contact (see [`SAFETY.md`](./SAFETY.md)). Test sessions run the draft and never fire integrated channels. The simplest route is `cb bot test <id> "message" [--lead <leadId>]`, which runs the steps below and cleans up after itself.

```bash
# 1. Create the session. The body is {} and the response is {leadId, sourceId}.
LEAD_ID=$(curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/testSession" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{}' | jq -r '.leadId // empty')

# 2. Give it a real source BEFORE the first message. Without this, source variables and the
#    source's KB are invisible to the bot.
curl -sS -X PUT "https://api.closebot.com/bot/$BOT_ID/testSession/$LEAD_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"mimicSourceId": "src_XXXX"}'

# 3. Send a message. Repeat with the same leadId to continue the conversation.
curl -sS -X POST "https://api.closebot.com/bot/$BOT_ID/testSession/message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d "{\"leadId\":\"$LEAD_ID\",\"message\":\"Hi, I'm interested in your services\"}"

# 4. Read the result. GET /bot/{botId}/testSession returns lastMessage + mostRecentFailureReason.
#    GET /bot/{botId}/testSession/messages/{leadId} is an SSE long-poll: always use --max-time.
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$BOT_ID/testSession"

# 5. Clean up. This is Tier 1: tier2Exempt, and cb bot test does it for you.
curl -sS -X DELETE -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BOT_ID/testSession/$LEAD_ID"
```

Full recipe, including the SSE event shapes: [`playbooks/07-test-session.md`](./playbooks/07-test-session.md).

### Step 5 — Publish (Tier 2)

```bash
# ⚠ Tier 2 — explicit confirmation required
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BOT_ID/publish"
```

**Assume a publish can reach live leads immediately.** Treat it as a production change the moment it succeeds. Success looks like `{"version":"…","message":"null"}`, where `message` is a literal string and not an error. Confirm success by re-reading `GET /bot/{id}` and checking that the target version has `published==true`.

### Step 6 — Verify, then check channel assignment in the UI

Repo notes also describe a UI-only step where you assign the published version to the source's channels (`app.closebot.com` → bot → Versions). Whether that step is *required* before live conversations switch over is **unverified**, so do both:

- Assume the publish is already live.
- Confirm the channel assignment in the UI.

No API endpoint for channel assignment has been found.

---

## 6. Common patterns

### 6a. Lead qualification → booking

```
Source → Method (greet + qualify, EnableUpdateContact, EnableAddTag)
       → Comparator (qualified? AI evaluates)
         ├── true → Method (offer to book, EnableGhlBooking, EnableCheckAvailability)
         │           → Booking → End
         └── false → ModifyTags (add "not-qualified") → End
+ ScenarioAggression → ModifyTags (handover) → End
+ ScenarioGoodbye → Statement ("Have a great day!") → End
```

### 6b. FAQ deflection with smart escalation

```
Source → Method (try to answer from FAQ + library, EnableSmartFaq, EnableLibraryContext)
       → Comparator (resolved? AI evaluates)
         ├── true → Statement ("Anything else?") → loop back
         └── false → ModifyTags (handover) → Method (collect contact info) → End
```

### 6c. Appointment reminder with reschedule option

```
Source → Method (confirm appt, EnableModifyAppointment)
       → Switch (AI: confirm | reschedule | cancel)
         ├── confirm → Statement ("See you then!") → End
         ├── reschedule → Method (reschedule, EnableCheckAvailability + EnableGhlBooking) → End
         └── cancel → ModifyTags (cancelled) → End
```

### 6d. Multi-tenant via custom webhook

```
Source → WebHook (POST to your API with {leadId, message}, get back {customerTier, preferences})
       → Switch (AI uses webhook response to pick path)
         ├── enterprise → Method (premium flow, EnabledCustomTools=["sla-check"])
         └── standard → Method (standard flow)
```

Full custom-webhook reference: [`playbooks/10-custom-webhook-node.md`](./playbooks/10-custom-webhook-node.md).

---

## 7. Validating before saving

Before sending a `/save` payload, check it locally to catch errors faster than waiting for `invalidPaths`.

### 7a. Every node has a unique ID

```bash
jq '.nodes | group_by(.id) | map(select(length > 1)) | length' /tmp/steps.json
# Must be 0
```

### 7b. Every edge points at existing nodes

```bash
jq '
  .nodes as $n | .edges |
  map(select(
    (.source as $s | ($n | map(.id) | index($s)) == null) or
    (.target as $t | ($n | map(.id) | index($t)) == null)
  )) | length
' /tmp/steps.json
# Must be 0
```

### 7c. Every `Booking` node has a `CalendarId`

```bash
jq '.nodes | map(select(.type == "Booking" and (.data.CalendarId // "") == "")) | length' /tmp/steps.json
# Must be 0
```

### 7d. Every `Method` node with `EnableGhlBooking: true` has `GhlBookingCalendarId`

```bash
jq '.nodes | map(select(.type == "Method" and .data.EnableGhlBooking == true and (.data.GhlBookingCalendarId // "") == "")) | length' /tmp/steps.json
# Must be 0
```

### 7e. No leftover references to a previous client's brand in prompts

```bash
PREV_CLIENT="Old Brand Wellness"   # the brand from the template bot
jq --arg c "$PREV_CLIENT" '
  .nodes | map(select(
    .type == "Method" and (
      (.data.Instructions // "" | contains($c)) or
      (.data.Sections // [] | map(.Body // "" | contains($c)) | any)
    )
  )) | map({id, title: .data.Title})
' /tmp/steps.json
# Must be []
```

Run all five before every `/save` on a duplicated bot.

---

## 8. Versions & rollback

CloseBot keeps every published version. To list them:

```bash
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BOT_ID" | jq '.versions'
```

To pull the steps of an old version:

```bash
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BOT_ID/steps?botVersion=0.0.3" > /tmp/old.json
```

To "roll back": save the old steps as the new draft, then publish.

```bash
jq '{botSteps: .}' /tmp/old.json | curl -s -X POST \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  --data-binary @- "https://api.closebot.com/bot/$BOT_ID/save"

# Then publish (Tier 2; assume it's live at once) and check channel assignment in the UI
```

There's no `/rollback` endpoint — you reconstruct rollback by re-saving the older steps as a new draft.

---

## 9. Variables and custom tools

### Variables

Flow variables let you store data captured mid-conversation (lead name, preferred time, etc.) and reference it in later nodes.

```json
{
  "variables": [
    { "name": "lead_first_name", "type": "string" },
    { "name": "preferred_appt_time", "type": "string" },
    { "name": "qualified", "type": "boolean" }
  ]
}
```

Reference inside a Method's `Instructions` or `Sections[].Body` as `{{lead_first_name}}`.

Set explicitly with a `VariableEdit` node. Set implicitly by `MultiObjective` (it can write captured values to variables).

### Custom tools

Defined per-bot in `customTools`. Each is essentially an OpenAI-style function definition the LLM can call mid-conversation.

```json
{
  "customTools": [
    {
      "name": "lookup_membership_status",
      "description": "Check if a contact is a current paying member",
      "parameters": {
        "type": "object",
        "properties": {
          "email": { "type": "string" }
        },
        "required": ["email"]
      },
      "endpoint": "https://api.acme.example.com/membership/check",
      "method": "POST"
    }
  ]
}
```

Enable on a `Method` node via `EnabledCustomTools: ["lookup_membership_status"]`.

---

## 10. Debugging a misbehaving bot

| Symptom | Where to look |
|---|---|
| Bot ignores uploaded knowledge | Files uploaded but not attached to source. Check `POST /library/files/{fileId}/source/{sourceId}` was called. |
| Bot books wrong calendar | Inline calendar ID inside `Sections[].Body` text wasn't swapped. Search the JSON for the old calendar ID. |
| Bot mentions previous client's brand | Section bodies weren't fully rewritten. Run validation §7e. |
| Bot doesn't escalate aggressive leads | `ScenarioAggression` node missing or not connected. |
| Bot answers off-topic | `EnableLibraryContext` is on but library contains irrelevant content. Audit attached files. |
| `saveTools` returns 400 | Body sent as `{tools:[...]}` — must be raw array. |
| `save` returns 400 | `botSteps` wrapper missing or `botVersion` mismatch. |
| `publish` returns 400 | Latest draft has validation errors. Re-`save` first, check `invalidPaths`. |
| Live message returns 420 | Out of credits. Check `GET /agency/billing/balance`. Refill with `POST /agency/billing/refill` and body `{amount, currency}` (`CreateRefillDto`). That call is Tier 2 and charges real money; see [`playbooks/08-refill-credits.md`](./playbooks/08-refill-credits.md). |
| Live message returns 460 | Account limit hit. Threshold undocumented — escalate to CloseBot support. |

Full status-code reference for the live message endpoint: [`06-live-message.md`](./06-live-message.md).

---

## 11. Reference quick links

| What | Where |
|---|---|
| Full node schema (every property of every node) | [`schema/node-descriptors.json`](../schema/node-descriptors.json) |
| Verified-real example payload | Your template bot's steps: `GET /bot/$CB_TEMPLATE_BOT/steps?botVersion=<ver>` |
| Bot endpoints (24 ops) | [`endpoints/bot.md`](./endpoints/bot.md) |
| Custom webhook deep dive | [`playbooks/10-custom-webhook-node.md`](./playbooks/10-custom-webhook-node.md) |
| Live message endpoint spec | [`schema/live-message.json`](../schema/live-message.json) |
| Tool and AI-provider behaviour (Smart FAQ, Email, etc.) | CloseBot's official docs: <https://docs.closebot.com> |
| Job-flow conceptual guide | CloseBot's official docs: <https://docs.closebot.com>; node fields: [`../schema/node-descriptors.json`](../schema/node-descriptors.json) |
