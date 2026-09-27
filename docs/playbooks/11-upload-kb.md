# Playbook 11 — Upload, edit, and remove knowledge base content

**Verified live: 2026-05-04** against an agency test source (`src_XXXXXXXXXXXXXXXX`).

CloseBot exposes four KB ingestion paths. All four are API-callable. All require attaching the resulting artifact to a source before the bot can use it.

---

## Decision: which path to use

| Path | Best for | Reliability | Endpoint |
|---|---|---|---|
| **Smart FAQ** | Q&A pairs, structured knowledge | Highest | `POST /smart-faq` |
| **Text input / TXT file** | Hand-curated content, manual paste | Highest | `POST /library/files` (multipart with `.txt`) |
| **CSV / DOCX / PDF upload** | Existing documents | High → Low (TXT > CSV > DOCX > PDF) | `POST /library/files` |
| **Web scrape** | Public web content | Variable (includes navigation/footer junk) | `POST /library/webscrape` |

Hard limits:
- 6 MB max per document (auto-stops scraping at threshold)
- Web scrapes auto-refresh every 24 hours
- Web scrape does not work on Google Docs or auth-walled URLs

---

## A. Smart FAQ — Q&A pairs

### Create
```bash
source .env
SOURCE_ID="src_XXXXXXXXXXXXXXXX"

curl -X POST "https://api.closebot.com/smart-faq" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "'"$SOURCE_ID"'",
    "question": "What are your hours?",
    "answer": "Monday-Friday 9am-5pm PT."
  }'
```

**Returns:** `HTTP 204 No Content` (empty body). To get the new FAQ ID, immediately:
```bash
curl "https://api.closebot.com/smart-faq" -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  | jq '.[] | select(.question == "What are your hours?")'
```

### Edit (bulk-update answers)
```bash
curl -X POST "https://api.closebot.com/smart-faq/answer" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "faQs": [
      { "id": "faq_XXXXXXXXXXXXXXXX", "answer": "Mon-Fri 9-5 PT, Sat by appt." }
    ]
  }'
```

**Returns:** `HTTP 200` + array of updated `SmartFAQDto`. This is the same endpoint CloseBot uses to fill in unanswered FAQs auto-generated from real conversations.

### Optional: re-engage leads who asked an unanswered question
```bash
curl -X POST "https://api.closebot.com/smart-faq/answered-followup" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "faqId": "faq_XXXXXXXXXXXXXXXX",
    "leadIds": ["lead_xxx", "lead_yyy"]
  }'
```
**Tier 2** — this sends real messages.

### Remove
```bash
curl -X DELETE "https://api.closebot.com/smart-faq/faq_XXXXXXXXXXXXXXXX" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
# Returns HTTP 204
```

---

## B. File upload — TXT / CSV / DOCX / PDF (or paste-as-text)

### Upload
```bash
source .env

curl -X POST "https://api.closebot.com/library/files" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -F "file=@/path/to/document.txt"
```

**Returns:** `HTTP 200` + `{ "id": "file_..." }`. **Note:** response only contains the ID, not a full FileDto. Fetch detail separately:

```bash
FILE_ID="file_XXXXXXXXXXXXXXXX"
curl "https://api.closebot.com/library/files/$FILE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

**File status flow:** `uploaded` → `Queued for Scraping` → `Processing` → `Live`.

### Paste raw text (no actual file on disk)
Save the text to a `.txt` first, then upload as above:
```bash
echo "Paste your content here." > /tmp/kb-blurb.txt
curl -X POST "https://api.closebot.com/library/files" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -F "file=@/tmp/kb-blurb.txt"
```
CloseBot's "Text Input" UI option does the same thing internally (auto-converts to bot-friendly `.txt`).

### Edit (replace file contents)
```bash
curl -X PUT "https://api.closebot.com/library/files/$FILE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -F "newFile=@/path/to/new-version.txt"
```

### Remove
```bash
curl -X DELETE "https://api.closebot.com/library/files/$FILE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
# Returns HTTP 200
```

---

## C. Web scrape

### Create
```bash
source .env

curl -X POST "https://api.closebot.com/library/webscrape" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scrapeUrl": "https://example.com/products",
    "maxBreadth": 1,
    "maxDepth": 1
  }'
```

**Returns:** `HTTP 200` + `{ "message": "Webscrape uploaded successfully", "id": "file_...", "totalSize": 528 }`.

`maxBreadth` / `maxDepth` (heuristic mapping based on the "Detail Levels" options in the CloseBot UI):

| UI label | Suggested values |
|---|---|
| Quick | `maxBreadth: 1, maxDepth: 1` |
| Standard | `maxBreadth: 5, maxDepth: 2` |
| Thorough | `maxBreadth: 10, maxDepth: 3` |

(Not officially documented — verify empirically when you need higher scope.)

### Inspect scraped pages
```bash
curl "https://api.closebot.com/library/files/$SCRAPE_ID/scrape-pages" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
# Returns: [{ "url": "https://example.com/products", "enabled": true }, ...]
```

### Toggle individual pages on/off
```bash
curl -X PUT "https://api.closebot.com/library/files/$SCRAPE_ID/scrape-pages" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pages": [
      { "url": "https://example.com/about", "enabled": false },
      { "url": "https://example.com/products", "enabled": true }
    ]
  }'
```

### Remove
Same endpoint as file delete:
```bash
curl -X DELETE "https://api.closebot.com/library/files/$SCRAPE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

---

## D. Attach to a source (REQUIRED for bot to use the doc)

Per CloseBot docs: *"Knowledge documents must be connected to sources immediately after creation or once Live status is reached. Sources cannot access scraped information without this connection."*

This applies to both regular file uploads and webscrapes — they're all `library/files/*` artifacts.

### Attach
```bash
FILE_ID="file_XXXXXXXXXXXXXXXX"
SOURCE_ID="src_XXXXXXXXXXXXXXXX"

curl -X POST "https://api.closebot.com/library/files/$FILE_ID/source/$SOURCE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": [],
    "channels": [],
    "enabled": true,
    "personaNameOverride": null
  }'
# Returns HTTP 204
```

`AttachSourceInput` fields:
- `tags` (array of `ContactTag`) — limit doc visibility to contacts with these tags
- `channels` (array of strings) — limit by channel (sms, email, web, etc.)
- `personaNameOverride` (string) — per-source persona name override
- `enabled` (boolean) — toggle without detaching

### Detach
```bash
curl -X DELETE "https://api.closebot.com/library/files/$FILE_ID/source/$SOURCE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
# Returns HTTP 200
```

Smart FAQs are tied to `sourceId` at creation, no separate attach step needed.

---

## E. Find a source ID

```bash
curl "https://api.closebot.com/agency/source" -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  | jq '.results[] | { sourceId, name, category, key }'
```

Use `key` (the GHL location ID) to identify the right source for GHL-backed accounts.

---

## Tier classification (per `docs/SAFETY.md`)

| Operation | Tier | Why |
|---|---|---|
| `GET /smart-faq`, `GET /library/files`, `GET .../scrape-pages`, `GET .../view` | 0 | Read-only |
| `POST /smart-faq` | 1 | Creates content but reversible |
| `POST /smart-faq/answer` | 1 | Updates content |
| `POST /smart-faq/answered-followup` | **2** | Sends real messages to leads |
| `POST /library/files`, `PUT /library/files/{id}`, `POST /library/webscrape` | 1 | Adds content, reversible |
| `POST /library/files/{id}/source/{sourceId}`, attach/detach | 1 | Configuration change |
| `DELETE /smart-faq/{id}`, `DELETE /library/files/{id}` | **2** | Permanent removal |

---

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| Bot doesn't reference uploaded content | File never attached to source | `POST /library/files/{id}/source/{sourceId}` |
| `fileSize: 0` after webscrape | Still processing (status='uploaded') | Poll `GET /library/files/{id}` until `fileStatus` flips |
| Webscrape returns small `totalSize` | URL is JS-rendered or auth-walled | Use a static page or upload as TXT instead |
| FAQ "answered" but bot doesn't use it | FAQ `state` not yet propagated, or source has FAQ disabled | Check `state == 1` and source's SmartFAQ tool toggle |
| 6MB cutoff | Hard limit | Split content across multiple files |

---

## Reference examples

- `schema/examples/smart-faq.create-request.json`
- `schema/examples/smart-faq.list-response.json`
- `schema/examples/library.upload-response.json`
- `schema/examples/library.file-get.json`
- `schema/examples/library.webscrape-create.json`
