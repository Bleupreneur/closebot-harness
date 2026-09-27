---
name: closebot-attach-knowledge
description: Use when the user wants to add OR update knowledge on a CloseBot source — phrases like "upload these docs to [client]", "add FAQs to [source]", "scrape [URL] for [client]", "load the new pricing PDF into [client]", "feed this content to the bot", "fix/update the pricing in [client]'s library file", "the [doc] is out of date — replace it", "what's in [client]'s library file". Handles all three ingestion paths (Smart FAQ, library files, web scrapes), in-place file content replace, and ENFORCES the source-attach step that's the #1 thing people forget. Bulk-loop friendly.
tools: [cb source get-source, cb bot audit, cb bot post-source, cb smartfaq post-smart-faq, cb smartfaq post-answer, cb smartfaq delete-smart-faq, cb smartfaq get-smart-faq, cb kb build, cb kb update, cb kb verify, cb library get-view, cb bot test]
---

# Skill: closebot-attach-knowledge

Add or update knowledge on a CloseBot source: Smart FAQs, library files, or
web scrapes. **Every file/scrape must be attached to a source after upload —
without it, the file exists in the library but no bot can see it.** This is
the most common failure mode; this skill enforces the attach step.

## When to use
- "upload [file] to [client/source]" / "add FAQs for [client]"
- "scrape [URL] for [client]" / "load these docs into the bot for [client]"
- "the bot doesn't know about X — add it" / "[doc] is out of date — replace it"

## Do not use when
- The bot's flags/flow need changing, not its knowledge → `closebot-edit-job-flow`
- Diagnosing why a bot ignores existing knowledge → `closebot-debug-bot`
  (checks the same flags this skill sets up, from the symptom side)

## Procedure
1. Resolve the target source (`cb source get-source --json`, filter by name)
   and confirm it exists.
2. Confirm the bot is wired to see it, BEFORE uploading anything:
   `cb bot audit <BOT_ID> --json | jq '.sources, .method_nodes[].flags'` — a
   missing source attach or `EnableLibraryContext:false` makes any upload
   invisible. See `references/kb-operations.md` for the fix commands.
3. Pick the ingestion path:
   - **Single Q&A** → `cb smartfaq post-smart-faq --body '{"sourceId":...,"question":...,"answer":...}'`
   - **Bulk files / FAQ CSV / one web scrape** → `cb kb build --source <src_id> --from <dir> [--faq-csv f] [--url u]`
     — uploads, scrapes, loads the CSV, attaches everything, and ends by
     calling `kb verify` itself. Live-proven 2026-09-05 on the sandbox
     (`cli/sandbox.json` → `sourceId`, manifest in `cli/sandbox-kb/`).
   - **Fix content already in the library** → `cb kb update --from <dir>`
     (replaces in place via multipart, same `fileId`, keeps all attachments —
     never re-upload a fresh copy, that orphans the old one).
   - Full command reference, reliability order (TXT>CSV>DOCX>PDF), and the
     never-scrape-homepages rule: `references/kb-operations.md`.
4. `cb kb verify --source <src_id> --bot <BOT_ID>` — confirms attachment and
   flags any Method node still missing `EnableLibraryContext`.
5. Sandbox-confirm — test sessions have NO source context by default, so
   create the session, point it at the real source, then ask in that session:
   `L=$(cb bottesting post-testsession --botId <BOT_ID> --body '{}' --json | jq -r .leadId)`
   → `cb bottesting put-testsession --botId <BOT_ID> --leadId $L --body '{"mimicSourceId":"<src_id>"}'`
   → `cb bot test <BOT_ID> "<question>" --lead $L --max-time 30 --json` (the
   `tools` array shows `get_library_context` when the library answered)
   → `cb bottesting delete-testsession --botId <BOT_ID> --leadId $L`.
   Test sessions run the DRAFT. A `"not 100% sure"` reply with no tool call
   means the prompt is steering (blank Job Info line, e.g. `Office Hours: `)
   — template it (`{{source.office_hours}}`) rather than adding more KB.
6. Report what was added/changed, where it was attached, and the verify +
   sandbox-test result. This skill never publishes.

## Tier
1 for every write (Smart FAQ POST/PUT, file upload/replace, attach, scrape,
`kb build`/`kb update`); 0 for reads (`kb verify`, `library get-view`,
`bot audit`); `smartfaq delete-smart-faq` is Tier 2 — confirm before use.

## Gotchas that shaped this skill
- `EnableSmartFaq` and `EnableLibraryContext` are independent — a bot can
  answer FAQs fine while completely blind to library files.
- Editing a file's content means `cb kb update`, not upload-new — a fresh
  upload orphans the old attached file and its source attachment.
- Smart FAQ POST returns 204 with no body — `cb`'s follow-up GET recovers the
  created row; don't expect an id back directly.
- `cb bot post-source` with the schema-minimum body writes `""` for every
  flow variable, overriding the bot's defaults — set them right after with
  `cb botsourcevariable post-botvariables` (see `references/kb-operations.md`).

## References
- `references/kb-operations.md` — full command inventory per ingestion path,
  the bot-wiring check, in-place update mechanics, and the failure-modes table.
- `references/kb-management.md` — the underlying REST endpoint inventory this
  composite wraps.
- `references/kb-stale-vector-purge.md` — case study: a bot that says
  "not sure" on a business fact is a KB `NOT CONFIRMED` line; PUT-replace leaves
  stale vectors, so the fix is delete + fresh upload + FAQ recreate.
- `references/kb-contract-verify.py` — an independent, read-only evaluator
  probe for checking a KB build out-of-band (not needed for `cb kb`, which
  has `cb kb verify`).
