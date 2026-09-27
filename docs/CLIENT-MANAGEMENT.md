# Client management

How to run a CloseBot agency from this toolkit. Covers the lifecycle: onboarding a new client, updating existing clients (FAQs, text uploads, scrapes, calendar swaps), duplicating proven bots, adjusting per-client, pulling per-client metrics, and pausing AI when a human takes over.

Every command assumes `source .env` is loaded so `$CLOSEBOT_API_KEY` is available.

---

## 1. Mental model — how clients map to CloseBot

| Real-world thing | CloseBot construct | Endpoint |
|---|---|---|
| **Client / GHL sub-account** | `Source` | `GET /agency/source` |
| **The agent that talks to that client's leads** | `Bot` (attached to a Source) | `GET /bot`, `POST /bot/{id}/source/{sourceId}` |
| **A specific person being messaged** | `Lead` (lives under a Source) | `GET /lead`, `GET /lead/{leadId}` |
| **Client's knowledge base** | `Library files` + `Smart FAQ`, attached to their Source | `POST /library/files/{fileId}/source/{sourceId}`, `POST /smart-faq` |
| **Client's brand voice / tone preset** | `Persona` | `GET /persona`, `PUT /persona/{id}` |
| **What this month cost / how many credits left** | `Billing` | `GET /agency/billing/balance`, `GET /agency/billing/usages` |

The cleanest agency structure:

```
Source A (= Client A's GHL sub-account)
├── Bot A1 (lead qualification SMS bot)
│   └── Attached library files + Smart FAQs (client-A scope)
├── Bot A2 (web chat widget)
└── Persona (client-A brand voice)
Source B (= Client B's GHL sub-account)
├── Bot B1 (...)
...
```

One Source per client. One or more Bots per Source. Knowledge attaches to the **Source** (so any bot under that Source can use it), not to individual bots.

---

## 2. Inventory — what do I currently have?

Run this first, every time. Saves 30 minutes of confusion later.

```bash
# Every source (= every client)
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/agency/source \
  | jq '.[] | {id, name, channels: (.channels | length), created: .createdAt}'

# Every bot, grouped by which source it's attached to
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/bot \
  | jq 'sort_by(.name) | .[] | {id, name, category, sources: [.sources[]?.sourceId]}'

# Personas (brand voice presets)
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/persona | jq '.[] | {id, name, default}'

# Credit balance
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/agency/billing/balance | jq .
```

Save the output. The IDs (`src_...`, `bot_...`, `pers_...`) are the only thing that matters when scripting — names can change, IDs are forever.

### Naming conventions (recommended)

CloseBot doesn't enforce naming, but consistent names make `jq` filtering trivial:

```
Bot name format:   "<Client Brand> — <Channel> — <Purpose>"
Examples:          "Acme Med Spa — SMS — Lead Qual"
                   "Acme Med Spa — Web — FAQ Bot"
                   "Bright Realty — SMS — Showing Booker"
```

Add a `[DRAFT]` suffix while you're customizing, remove it after publish (see playbook 12, step 8).

---

## 3. Onboarding a new client

**Full step-by-step:** [`playbooks/12-onboard-new-client.md`](./playbooks/12-onboard-new-client.md).

The 8-step shape:

| # | Step | API |
|---:|---|---|
| 1 | Smoke + capture base bot | `GET /bot/{id}` (base bot) |
| 2 | Duplicate the base bot | `POST /bot/{id}/duplicate` → rename via `PUT /bot/{id}` |
| 3 | Pull job flow for editing | `GET /bot/{id}/steps?botVersion=$VER` (`$VER` = `.target` from `cb bot version <id>`, the highest-semver version; `0.0.1` only for a freshly duplicated bot) |
| 4 | Customize the "seven dials" (calendar, prompts, tool flags, tags, save, account-tools, attach source) | `POST /bot/{id}/save`, `POST /bot/{id}/saveTools`, `POST /bot/{id}/source/{sourceId}` |
| 5 | Upload client KB (files + scrapes + FAQs) | `POST /library/files`, `POST /library/webscrape`, `POST /smart-faq`, then attach each |
| 6 | Test in sandbox | Use a test session (`cb bot test`): `POST /bot/{botId}/testSession` → `PUT /bot/{botId}/testSession/{leadId}` with `{mimicSourceId}` → `POST /bot/{botId}/testSession/message`. Never test through the live message endpoint with a made-up `id` ([`SAFETY.md`](./SAFETY.md)) |
| 7 | **Publish (Tier 2)** | `POST /bot/{id}/publish`. Assume it affects live leads at once; also check version→channel assignment in the UI (unverified whether that is required) |
| 8 | Rename to remove `[DRAFT]` | `PUT /bot/{id}` |

**Hard prerequisite:** the client's Source (GHL connection) must exist already. Source creation is OAuth-flow only — UI, not API. You can't script "add a brand-new GHL sub-account to CloseBot."

---

## 4. Updating an existing client's knowledge base

Three ingestion paths. Pick based on the type of content. Full recipes in [`playbooks/11-upload-kb.md`](./playbooks/11-upload-kb.md).

### 4a. Smart FAQs — Q&A pairs

Best for "what are your hours?", "do you take insurance?", structured Q&A from a discovery call.

```bash
SOURCE_ID="src_..."   # find with: GET /agency/source

curl -s -X POST "https://api.closebot.com/smart-faq" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"sourceId\": \"$SOURCE_ID\",
    \"question\": \"Do you take insurance?\",
    \"answer\": \"We don't bill insurance directly, but we provide superbills you can submit for out-of-network reimbursement.\"
  }"
# → HTTP 204 (no body)
```

To edit an existing FAQ's answer:

```bash
curl -s -X POST "https://api.closebot.com/smart-faq/answer" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"faQs": [{"id": "faq_...", "answer": "Updated answer text."}]}'
```

To delete:

```bash
curl -s -X DELETE "https://api.closebot.com/smart-faq/{id}" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

To list all FAQs for a source:

```bash
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/smart-faq?sourceId=$SOURCE_ID" | jq .
```

### 4b. Text/document uploads (TXT, CSV, DOCX, PDF)

Reliability order: **TXT > CSV > DOCX > PDF**. Always prefer TXT when you can convert.

```bash
# Step 1: upload
FILE_ID=$(curl -s -X POST "https://api.closebot.com/library/files" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -F "file=@/path/to/client-services.txt" | jq -r '.id')
echo "Uploaded file: $FILE_ID"

# Step 2: ATTACH IT TO THE SOURCE — without this, the bot can't see it
curl -s -X POST "https://api.closebot.com/library/files/$FILE_ID/source/$SOURCE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"tags":[],"channels":[],"enabled":true}'
# → HTTP 204
```

**Common mistake:** uploading a file but forgetting the attach step. The file exists in the library but no bot has access to it. Always do both calls.

Bulk-upload a folder of docs:

```bash
for f in /path/to/client/docs/*.txt; do
  FILE_ID=$(curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
    -F "file=@$f" "https://api.closebot.com/library/files" | jq -r '.id')
  curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
    -d '{"tags":[],"channels":[],"enabled":true}' \
    "https://api.closebot.com/library/files/$FILE_ID/source/$SOURCE_ID" >/dev/null
  echo "✓ $f → $FILE_ID"
done
```

### 4c. Web scrapes — fresh content from the client's site

Scrapes auto-refresh every 24 hours. Max 6 MB per scrape.

```bash
SCRAPE_ID=$(curl -s -X POST "https://api.closebot.com/library/webscrape" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"scrapeUrl":"https://acme.example.com/services","maxBreadth":1,"maxDepth":1}' | jq -r '.id')

# Attach (same shape as a file)
curl -s -X POST "https://api.closebot.com/library/files/$SCRAPE_ID/source/$SOURCE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"tags":[],"channels":[],"enabled":true}'
```

**Always scrape specific pages, not homepages.** A homepage scrape grabs nav/footer/marketing junk that pollutes the KB. Point at `/services`, `/pricing`, `/hours`, etc.

Toggle individual pages on/off after a scrape:

```bash
curl -s -X PUT "https://api.closebot.com/library/files/$SCRAPE_ID/scrape-pages" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"pages":[{"url":"https://acme.example.com/services","enabled":true},{"url":"https://acme.example.com/old-blog","enabled":false}]}'
```

### 4d. Removing stale content

```bash
# Delete a file or scrape (also removes it from all sources)
curl -s -X DELETE -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/library/files/$FILE_ID"
```

Tier 1 — reversible only by re-uploading. Confirm before bulk deletes.

---

## 5. Duplicating a proven bot for a new client

The "template bot" pattern. Build one excellent bot for one industry, then duplicate + adjust for every new client in that vertical.

```bash
BASE_BOT_ID="bot_XXXXXXXXXXXXXXXX"   # Your proven bot

NEW_BOT=$(curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BASE_BOT_ID/duplicate" \
  -H "Content-Type: application/json" | jq -r '.id')
echo "New bot ready: $NEW_BOT"
```

Immediately rename so you don't lose track:

```bash
curl -s -X PUT -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Acme Med Spa — SMS — Lead Qual [DRAFT]","category":"GHLS"}' \
  "https://api.closebot.com/bot/$NEW_BOT"
```

Then customize the **seven dials** — see [`playbooks/12-onboard-new-client.md`](./playbooks/12-onboard-new-client.md) step 4 for the full mutation pattern.

### Maintaining template bots

Keep a small set of "gold" template bots, one per vertical:

| Template | Industry | Notes |
|---|---|---|
| `bot_xxx_med_spa_v3` | Med spa / aesthetic | Booking-heavy, EnableModifyAppointment on |
| `bot_xxx_real_estate_v2` | Residential RE | EnableGetPropertyDetails + SendPropertyImage on |
| `bot_xxx_gym_v1` | Gym / fitness | Membership-focused, EnableEmail optional |
| `bot_xxx_service_v2` | Plumbers/HVAC/etc. | EnableCheckDistance optional |

When the template improves, **don't auto-propagate** to existing clients. Test the improvement in a fresh duplicate, get sign-off per client, then apply selectively. Client bots drift from their templates intentionally over time.

---

## 6. Adjusting a single client's bot (without duplicating)

When a client asks "can you change X?" — edit in place.

### The standard edit loop

```bash
BOT_ID="bot_xxx"

# 1. Resolve the edit target (highest semver; never hardcode 0.0.1, never "last unpublished",
#    which resurrects stale drafts once the head is published; see GOTCHAS 2026-07-02),
#    then pull its steps (botVersion is REQUIRED even though the OpenAPI spec says optional)
VER=$(cb bot version "$BOT_ID" | jq -r .target)
# Raw-HTTP equivalent: curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$BOT_ID" \
#   | jq -r '.versions | sort_by(.version | split(".") | map(tonumber)) | last | .version'
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BOT_ID/steps?botVersion=$VER" > /tmp/steps.json

# 2. Mutate /tmp/steps.json with jq, sed, or by hand. Examples:

# Swap the calendar ID
jq --arg cal "new_calendar_id" '
  .nodes |= map(
    if .type == "Method" then .data.GhlBookingCalendarId = $cal
    elif .type == "Booking" then .data.CalendarId = $cal
    else . end
  )
' /tmp/steps.json > /tmp/steps2.json && mv /tmp/steps2.json /tmp/steps.json

# Update a Method node's instructions
jq '.nodes |= map(
  if .type == "Method" and .data.Title == "Lead Qualification" then
    .data.Instructions = "New instructions text here..."
  else . end
)' /tmp/steps.json > /tmp/steps2.json && mv /tmp/steps2.json /tmp/steps.json

# Toggle a tool off across all Method nodes
jq '.nodes |= map(
  if .type == "Method" then .data.EnableSendPropertyImage = false else . end
)' /tmp/steps.json > /tmp/steps2.json && mv /tmp/steps2.json /tmp/steps.json

# 3. Save back
jq '{botSteps: .}' /tmp/steps.json | curl -s -X POST \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  --data-binary @- \
  "https://api.closebot.com/bot/$BOT_ID/save"
```

The save response must include `"invalidPaths": []`. Non-empty `invalidPaths` means at least one node failed validation and was **not saved** — fix and resubmit.

### What's safe to edit live vs. needs a publish

Edits to a bot's steps modify the **draft version**. They do not affect live conversations until you publish. Once you publish, **assume the change can reach live leads immediately**. Repo notes also describe a UI step that assigns the published version to channels; whether that step is required is **unverified**, so check it too.

Some changes skip the publish gate and go live straight away:

- replacing a library file's content with `PUT /library/files/{fileId}` (live once the file is re-indexed)
- Smart FAQ edits
- the per-lead AI toggle

```bash
# Tier 2 — confirm with the user first
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BOT_ID/publish"
```

For a safe workflow, test the change in a sandbox conversation before publishing — see [`playbooks/07-test-session.md`](./playbooks/07-test-session.md).

### Adjusting per-client without touching the job flow

Some changes don't require editing steps:

| Change | Endpoint |
|---|---|
| Rename bot | `PUT /bot/{id}` |
| Swap persona (brand voice) | **UI only** ([`../GOTCHAS.md`](../GOTCHAS.md) 2026-06-22). `UpdateBotInput` (`PUT /bot/{id}`) does expose `personaIds` and `personaWeights`, but assigning a persona that way is **unverified**. Never use `PUT /persona/{id}` to do it: that call flips `default=true` as a side effect, and the API cannot undo it |
| Toggle account-level tools (Smart FAQ, Email, Summary, Transcript, Follow Up) | `POST /bot/{id}/saveTools` (raw array body) |
| Attach/detach a source | `POST` / `DELETE /bot/{id}/source/{sourceId}` |

Account-tools body shape (note: **raw array**, not `{tools: [...]}`):

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

---

## 7. Per-lead control — turning AI off when a human takes over

When a client's salesperson wants to take over a specific conversation, pause AI for just that lead:

```bash
LEAD_ID="lead_xxx"   # find with GET /lead

# Toggle AI off
curl -s -X PUT -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"enabled":false}' \
  "https://api.closebot.com/lead/$LEAD_ID/ai-toggle"

# Re-enable later
curl -s -X PUT -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"enabled":true}' \
  "https://api.closebot.com/lead/$LEAD_ID/ai-toggle"
```

Send a message manually as the bot identity (without invoking AI):

```bash
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"message":"Hi, this is Sarah from our team. I saw your inquiry and wanted to follow up personally."}' \
  "https://api.closebot.com/lead/$LEAD_ID/send-message"
```

Full recipe: [`playbooks/05-lead-ai-off.md`](./playbooks/05-lead-ai-off.md).

---

## 8. Per-client metrics

Pull conversation volume, conversion, credit burn, and tool usage per bot. Useful for monthly client reports.

```bash
SOURCE_ID="src_XXXXXXXXXXXXXXXX"   # the client's source
BOT_ID="bot_XXXXXXXXXXXXXXXX"

# Headline numbers for one client
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/botMetric/agencySummary?sourceId=$SOURCE_ID" | jq .

# Message volume for a date range
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/botMetric/messageCount?sourceId=$SOURCE_ID&start=2026-05-01&end=2026-05-31" | jq .

# Tool/action frequency (which features did the bot actually use?)
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/botMetric/actionCount?botId=$BOT_ID&start=2026-05-01&end=2026-05-31" | jq .
```

Full set of metric endpoints: [`endpoints/botmetric.md`](./endpoints/botmetric.md).

Recipe for monthly client report: [`playbooks/09-pull-metrics.md`](./playbooks/09-pull-metrics.md).

---

## 9. Billing — credits and account limits

```bash
# Remaining credits
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/agency/billing/balance | jq .

# Billed usage for a window
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/agency/billing/usages?startTime=2026-05-01&endTime=2026-05-31" | jq .

# Billing settings (auto-refill etc.)
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/agency/billing/options | jq .

# Top up credits — Tier 2, real money moves
# See playbooks/08-refill-credits.md before running
```

When the live-message endpoint starts returning `420 No Credits`, you're out. When it returns `460 Account Limit`, you've hit a plan threshold (exact number is undocumented — see CLAUDE.md gap registry).

---

## 10. Multi-client recurring tasks

Patterns for things you'll do across the whole agency.

### Snapshot every client's KB size

```bash
for src in $(curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/agency/source | jq -r '.[].id'); do
  faqs=$(curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/smart-faq?sourceId=$src" | jq 'length')
  files=$(curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/library/files?sourceId=$src" | jq 'length')
  echo "$src — FAQs: $faqs, Files: $files"
done
```

### Re-publish every draft bot

```bash
# WARNING: Tier 2 across many bots. Run individually after confirmation.
for bot in $(curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/bot | jq -r '.[] | select(.name | endswith("[DRAFT]")) | .id'); do
  echo "Ready to publish: $bot"
  # curl -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$bot/publish"
done
```

Never auto-loop Tier 2 calls without per-bot confirmation. The loop above only **lists** candidates — uncommenting the publish line is your call.

### Find every bot still using a deprecated calendar ID

```bash
OLD_CAL="oldCalendarId123"
for bot in $(curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/bot | jq -r '.[].id'); do
  # Each bot has its own head version: resolve it per bot (highest semver), never hardcode 0.0.1.
  ver=$(cb bot version "$bot" | jq -r .target)
  steps=$(curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$bot/steps?botVersion=$ver")
  if echo "$steps" | grep -q "$OLD_CAL"; then
    echo "Found in: $bot"
  fi
done
```

---

## 11. What can't be done via API (UI-only)

These require logging into `app.closebot.com`:

| Task | Why |
|---|---|
| **Creating a new GHL source connection** | OAuth flow only — not API-callable |
| **Assigning a persona as "default" then unsetting it** | `PUT /persona/{id}` flips `default=true` as a side-effect and can't be reverted via API |
| **Connecting CloseBot to a brand-new GHL agency** | Requires CloseBot Marketplace install + OAuth |
| **Assigning a published bot version to a source's channels** | Described as a UI step after `POST /bot/{id}/publish`. It is **unverified** whether this is required before live leads get the new version, so treat the publish itself as live |
| **Assigning a persona to a bot** | UI only per GOTCHAS 2026-06-22. The `personaIds` route on `PUT /bot/{id}` is unverified |
| **Webhook event subscriptions** | No platform event-bus exists — webhooks are user-defined via the Custom Webhook job-flow node |

Refuse any agent suggestion that claims to do these via API. Direct the user to the relevant UI panel.

---

## 12. Risk tiers reference

Every call you'll make falls into one of three tiers. Full classification: [`SAFETY.md`](./SAFETY.md).

| Tier | What | Examples in this guide |
|---|---|---|
| **0** | Read-only, completely safe | All `GET` calls, smoke test, inventory, metrics, listing FAQs/files |
| **1** | Mutating, reversible | Edit job flow, upload file, create FAQ, duplicate bot, attach source, toggle AI off |
| **2** | Destructive or live-affecting | `DELETE` anything, `POST /bot/{id}/publish`, billing top-up — **always confirm in the same turn, never chain** |

---

## Quick command index

| You want to... | Command |
|---|---|
| See all clients | `GET /agency/source` |
| See all bots | `GET /bot` |
| Add a FAQ to client | `POST /smart-faq` |
| Upload doc to client | `POST /library/files` → `POST /library/files/{fileId}/source/{sourceId}` |
| Scrape page for client | `POST /library/webscrape` → attach |
| Duplicate a bot | `POST /bot/{id}/duplicate` |
| Edit a bot's steps | `cb bot version <id>` (`.target`) → `GET /bot/{id}/steps?botVersion=$VER` → mutate → `POST /bot/{id}/save` |
| Change account-level tools | `POST /bot/{id}/saveTools` (raw array) |
| Pause AI on one lead | `PUT /lead/{leadId}/ai-toggle` |
| Send a manual message | `POST /lead/{leadId}/send-message` |
| Test a bot (sandbox) | `cb bot test <id> "msg"` (test session: `POST /bot/{botId}/testSession` + `POST /bot/{botId}/testSession/message`) |
| Send a real live message (Tier 1, reaches a real person) | `POST https://api.closebot.ai/message` with a real contact `id` only |
| Publish a draft | `POST /bot/{id}/publish` **(Tier 2, assume it's live immediately)** |
| See metrics for one client | `GET /botMetric/agencySummary?sourceId=...` |
| See credit balance | `GET /agency/billing/balance` |
