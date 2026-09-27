# Playbook 12 — Onboard a new client (duplicate + customize)

**The core delivery workflow.** Take an existing proven bot, duplicate it, swap everything client-specific, attach their knowledge, test, publish.

**Verified live: 2026-05-04** (every API call below has been round-tripped).

---

## Inputs you need before starting

| Input | Where it comes from | Example |
|---|---|---|
| `BASE_BOT_ID` | A proven bot you're cloning from | `$CB_TEMPLATE_BOT` (your template bot, e.g. `bot_XXXXXXXXXXXXXXXX`) |
| `CLIENT_NAME` | Client's brand name | "Acme Med Spa" |
| `CLIENT_SOURCE_ID` | Their CloseBot source (or create one in UI first) | `src_...` from `GET /agency/source` |
| `CLIENT_CALENDAR_ID` | GHL calendar to book against | From their GHL sub-account |
| `CLIENT_KB_FILES` | TXT/CSV/DOCX/PDF docs from client | Local files |
| `CLIENT_KB_URLS` | Pages to scrape from their site | URLs |
| `CLIENT_FAQS` | Q&A pairs (optional, can grow over time) | Discovery call notes |

If `CLIENT_SOURCE_ID` doesn't exist yet, the OAuth-flow source connection is **UI-only** (per CloseBot docs, not API-callable). Add the GHL source manually in the CloseBot UI first, then come back.

---

## Step 1 — Smoke check + capture base bot

```bash
source .env
bash scripts/smoke.sh                                    # must be green
```

Capture base bot details so you know what you're cloning:

```bash
BASE_BOT_ID="bot_XXXXXXXXXXXXXXXX"
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BASE_BOT_ID" | jq '{name, category, versions, tools}'
```

Record the `version` (e.g., `0.0.1`). You'll need it when reading steps.

---

## Step 2 — Duplicate

```bash
NEW_BOT=$(curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$BASE_BOT_ID/duplicate" \
  -H "Content-Type: application/json" | jq -r '.id')
echo "New bot: $NEW_BOT"
```

Rename immediately so you don't lose it among "(Copy)" entries:

```bash
CLIENT_NAME="Acme Med Spa"
curl -s -X PUT -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d "{\"name\":\"$CLIENT_NAME [DRAFT]\",\"category\":\"GHLS\"}" \
  "https://api.closebot.com/bot/$NEW_BOT" >/dev/null
```

---

## Step 3 — Pull the job flow for editing

```bash
# Resolve the head version rather than assuming 0.0.1: a fresh duplicate can arrive
# already published (GOTCHAS 2026-09-04). .target = highest semver.
VER=$(cb bot version "$NEW_BOT" | jq -r .target)
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$NEW_BOT/steps?botVersion=$VER" > /tmp/steps.json
# or simply: cb bot pull "$NEW_BOT" --out /tmp/steps.json
```

The shape: `{ nodes, edges, variables, customTools, enabledGlobalToolNames }`. Pull your template bot's steps the same way for a complete reference.

---

## Step 4 — Customize (the seven dials)

These are the only things that should change between clients. Edit `/tmp/steps.json` to swap each:

### 4a. Calendar ID — every Method node and Booking node

```bash
CLIENT_CALENDAR_ID="abc123XYZcalendar"
jq --arg cal "$CLIENT_CALENDAR_ID" '
  .nodes |= map(
    if .type == "Method" then .data.GhlBookingCalendarId = $cal
    elif .type == "Booking" then .data.CalendarId = $cal
    else . end
  )
' /tmp/steps.json > /tmp/steps2.json && mv /tmp/steps2.json /tmp/steps.json
```

If the prompt also references the calendar ID inside `Sections[].Body` (many template bots do — it appears as a literal string), do a search-replace in step 4b.

### 4b. Method node prompts — `Sections[].Body` + `Instructions`

The single biggest customization. Open `/tmp/steps.json` in an editor and rewrite per Method node:
- **`data.Instructions`** — top-level agent prompt
- **`data.Sections[*].Title`** — section headers (often per-objective)
- **`data.Sections[*].Body`** — section content (replace product names, service language, calendar ID strings, brand tone)

Keep the structural elements the base bot has worked into the prompt:
- "Output must be plain text only / No symbols / No formatting" footers
- Agreement-required language for booking ("must clearly agree to a time")
- Calendar ID literal if the base bot uses one inline

### 4c. Tool flags — `EnableXXX` on each Method node

Defaults differ by industry. Copy this matrix as a starting point:

| Tool | Med spa | Real estate | Gym | Service biz |
|---|:-:|:-:|:-:|:-:|
| EnableUpdateContact | yes | yes | yes | yes |
| EnableAddTag | yes | yes | yes | yes |
| EnableCheckAvailability | yes | yes | yes | yes |
| EnableGhlBooking | yes | yes | yes | yes |
| EnableModifyAppointment | yes | no | yes | yes |
| EnableGetPropertyDetails | no | yes | no | no |
| EnableSendPropertyImage | no | yes | no | no |
| EnableCheckDistance | optional | yes | no | optional |
| EnableSmartFaq | yes | yes | yes | yes |
| EnableEmail | optional | yes | no | optional |
| EnableLibraryContext | yes (if KB) | yes (if KB) | yes (if KB) | yes (if KB) |

Patch all Method nodes:
```bash
jq '.nodes |= map(
  if .type == "Method" then 
    .data.EnableGetPropertyDetails = false |
    .data.EnableSendPropertyImage = false |
    .data.EnableCheckDistance = false
  else . end
)' /tmp/steps.json > /tmp/steps2.json && mv /tmp/steps2.json /tmp/steps.json
```

### 4d. Tag lists — `ModifyTags` nodes

Replace base bot's tag taxonomy with client's GHL tag conventions:
```bash
jq '.nodes |= map(
  if .type == "ModifyTags" and .data.Title == "human_handover" then
    .data.TagsToAdd = [{"Tag":"acme-handover-needed"}] |
    .data.TagsToRemove = []
  else . end
)' /tmp/steps.json > /tmp/steps2.json && mv /tmp/steps2.json /tmp/steps.json
```

Common tag nodes to update: `human_handover`, `emergency_human_handover`, `not_interested`, `ai_aggression_detected`. Check what the base bot has with `jq '.nodes[] | select(.type=="ModifyTags") | {title:.data.Title, add:.data.TagsToAdd, remove:.data.TagsToRemove}' /tmp/steps.json`.

### 4e. Save the edited job flow

```bash
jq '{botSteps: .}' /tmp/steps.json | curl -s -X POST \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  --data-binary @- \
  "https://api.closebot.com/bot/$NEW_BOT/save"
```

Response should be `{ "version": "0.0.1", "invalidPaths": [], "message": "" }`. **`invalidPaths` must be empty** — if not, the listed nodes failed validation and weren't saved.

### 4f. Account-level tools — `saveTools` (raw array body)

```bash
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '[
    {"type":"SmartFAQ","enabled":true,"options":{}},
    {"type":"Email","enabled":true,"options":{"AdditionalPrompt":"Concise. Match brand voice."}},
    {"type":"SummarizeConversation","enabled":true,"options":{"OutputVariable":null}}
  ]' \
  "https://api.closebot.com/bot/$NEW_BOT/saveTools"
```

**Body must be a raw array, not `{tools:[...]}`.** See `skills/learned/rest-api-spec-drift` for why.

### 4g. Attach the client's source

```bash
CLIENT_SOURCE_ID="src_..."
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"tags":[],"channels":[],"enabled":true}' \
  "https://api.closebot.com/bot/$NEW_BOT/source/$CLIENT_SOURCE_ID"
```

---

## Step 5 — Upload client knowledge base

Follow [playbook 11](./11-upload-kb.md) for full recipes. The minimum:

### Files (TXT > CSV > DOCX > PDF)
```bash
for f in /path/to/client/docs/*.txt; do
  FILE_ID=$(curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
    -F "file=@$f" "https://api.closebot.com/library/files" | jq -r '.id')
  curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
    -d '{"tags":[],"channels":[],"enabled":true}' \
    "https://api.closebot.com/library/files/$FILE_ID/source/$CLIENT_SOURCE_ID"
  echo "Uploaded + attached: $f → $FILE_ID"
done
```

### Web scrapes (specific pages, not homepages)
```bash
for url in "https://acme.example.com/services" "https://acme.example.com/pricing"; do
  SCRAPE_ID=$(curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
    -d "{\"scrapeUrl\":\"$url\",\"maxBreadth\":1,\"maxDepth\":1}" \
    "https://api.closebot.com/library/webscrape" | jq -r '.id')
  curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
    -d '{"tags":[],"channels":[],"enabled":true}' \
    "https://api.closebot.com/library/files/$SCRAPE_ID/source/$CLIENT_SOURCE_ID"
done
```

### Smart FAQs (from discovery call)
```bash
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d "{\"sourceId\":\"$CLIENT_SOURCE_ID\",\"question\":\"Do you take insurance?\",\"answer\":\"We don't bill insurance directly...\"}" \
  "https://api.closebot.com/smart-faq"
# Repeat per FAQ. POST returns 204; query GET /smart-faq to confirm.
```

---

## Step 6 — Test in sandbox before publishing

Test in an isolated **test session**, never through the live message endpoint. `POST https://api.closebot.ai/message` sends a real reply into a real channel, and a made-up `id` can resolve to a real contact (see [`../SAFETY.md`](../SAFETY.md)). The simplest route is `cb bot test <id> "message"`. The raw steps are below; the full recipe is in playbook [07-test-session.md](./07-test-session.md).

```bash
# 1. Create a session. The body is {} and the response is {leadId, sourceId}.
LEAD_ID=$(curl -sS -X POST "https://api.closebot.com/bot/$NEW_BOT/testSession" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{}' | jq -r '.leadId // empty')

# 2. Point it at the client's source BEFORE the first message, so source variables + KB apply.
curl -sS -X PUT "https://api.closebot.com/bot/$NEW_BOT/testSession/$LEAD_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d "{\"mimicSourceId\":\"$CLIENT_SOURCE_ID\"}"

# 3. Send a message. Repeat with the same leadId to continue the conversation.
curl -sS -X POST "https://api.closebot.com/bot/$NEW_BOT/testSession/message" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d "{\"leadId\":\"$LEAD_ID\",\"message\":\"Hi, I'm interested in your services\"}"

# 4. Read the reply and any failure reason (e.g. no_persona on a fresh duplicate).
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/bot/$NEW_BOT/testSession"

# 5. Clean up the ephemeral test lead (Tier 1, tier2Exempt).
curl -sS -X DELETE -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$NEW_BOT/testSession/$LEAD_ID"
```

Walk through the conversation. Check: tone matches brand, calendar ID is right, FAQs answer correctly, tools fire when expected, no leftover references to the base client (e.g., "Old Brand Wellness" appearing in an Acme Med Spa response).

---

## Step 7 — Publish

```bash
# Tier 2 — REQUIRES explicit user confirmation
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$NEW_BOT/publish"
```

**Assume the publish can reach live leads immediately.** Verify with `cb bot version $NEW_BOT` that the target is now `published`. Then check in the UI that the published version is assigned to the client's source channels. Whether that UI assignment is also required is **unverified**, so do both.

---

## Step 8 — Rename to remove [DRAFT]

```bash
curl -s -X PUT -H "X-CB-KEY: $CLOSEBOT_API_KEY" -H "Content-Type: application/json" \
  -d "{\"name\":\"$CLIENT_NAME\"}" \
  "https://api.closebot.com/bot/$NEW_BOT"
```

---

## Customization checklist (paste into your client kickoff doc)

```
[ ] Source created in CloseBot UI (OAuth flow, not API)
[ ] Source ID captured: src_____________________
[ ] Calendar ID captured: __________________________
[ ] Base bot identified: bot_____________________  (industry: ________)
[ ] Discovery call notes converted to FAQ pairs
[ ] Brand tone + voice guide collected
[ ] Service descriptions / pricing / hours collected
[ ] List of pages to scrape (specific URLs, not homepages)
[ ] Tag taxonomy mapped (handover, emergency, not_interested, etc.)
[ ] Tool matrix decided per industry table above
[ ] Test conversation transcript reviewed before publish
[ ] Stakeholder sign-off
```

---

## Tier classification

| Step | Tier | Why |
|---|:-:|---|
| 1, 2, 3 (smoke, duplicate, read) | 0–1 | Read-only or reversible |
| 4a–4g (edit job flow + tools + attach source) | 1 | Mutates draft, reversible until publish |
| 5 (upload KB) | 1 | Adds content, deletable |
| 6 (test session) | 1 | Isolated sandbox session; never fires real channels. Never test via the live message endpoint |
| 7 (publish) | **2** | Assume it reaches real conversations immediately. Explicit confirmation required |

---

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `invalidPaths` non-empty in `/save` response | Node-level validation failed | Inspect listed paths; usually a typo in `EnableXXX` flag or a malformed Sections array |
| Bot ignores uploaded knowledge | Files uploaded but not attached to source | Step 5 attachment loop missing for those files |
| Booking tries wrong calendar | Step 4a missed an inline calendar ID inside `Sections[].Body` | Search-replace literal calendar string in prompt text |
| Bot still says "Old Brand Wellness" or another base client name | Step 4b didn't fully rewrite Sections | Re-edit; the base brand often appears in 3-5 places |
| `saveTools` returns 400 | Body sent as `{tools:[...]}` instead of `[...]` | Strip the wrapper |
| Publish 400s | Validation failure in latest saved version | Run `/save` again first; check `invalidPaths` |
