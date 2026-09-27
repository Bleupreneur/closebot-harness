# Playbook 6 — Attach a knowledge file to a bot

**Tier 1**. Upload a file to the agency Library, then attach it to a specific bot's source.

## 1. (Tier 1) Upload the file

```bash
curl -sS -X POST "https://api.closebot.com/library/files" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pricing FAQ 2026",
    "type": "pdf",
    "content": "<base64 or url depending on schema — inspect ../endpoints/library.md>"
  }' | jq '{id, name}'
FILE_ID="<id from output>"
```

Inspect the exact request schema:
```bash
jq '.paths."/library/files".post.requestBody' schema/openapi.json
```

Alternative: web-scrape an external URL into a file:
```bash
curl -sS -X POST "https://api.closebot.com/library/webscrape" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com/pricing", "name": "Public Pricing Page" }'
```

## 2. (Tier 0) Find the source ID to attach to

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/agency/source" | jq '.[] | {id, name}'
SOURCE_ID="<id>"
```

## 3. (Tier 1) Attach the file to the source

```bash
curl -sS -X POST "https://api.closebot.com/library/files/$FILE_ID/source/$SOURCE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

## 4. (Tier 0) Verify scrape pages were generated

```bash
curl -sS -H "X-CB-KEY: $CLOSEBOT_API_KEY" "https://api.closebot.com/library/files/$FILE_ID/scrape-pages" | jq .
```

## 5. (Tier 1) Optionally: edit/replace scrape pages

```bash
curl -sS -X PUT "https://api.closebot.com/library/files/$FILE_ID/scrape-pages" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "pages": [{ "url": "...", "content": "..." }] }'
```

## Detach later

```bash
curl -sS -X DELETE "https://api.closebot.com/library/files/$FILE_ID/source/$SOURCE_ID" \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY"
```

This is **Tier 2** (destructive — the bot may degrade if it was citing this file). Confirm with the user.
