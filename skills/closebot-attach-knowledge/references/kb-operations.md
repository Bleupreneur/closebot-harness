# closebot-attach-knowledge — operation reference

## Establish and verify the target source

```bash
cb source get-source --json | jq '.[] | select(.name|test("<client>";"i"))'   # find by name
cb source get-a-source --id <src_id> --json                                   # verify one
```

## Confirm the bot is wired to see it (do this BEFORE any upload)

```bash
cb bot audit <BOT_ID> --json | jq '.sources, (.method_nodes[] | {title, EnableLibraryContext: .flags.EnableLibraryContext, EnableSmartFaq: .flags.EnableSmartFaq})'
```
`sources: []` → attach: `cb bot post-source --id <BOT_ID> --sourceId <src_id> --body '{"channels":[],"tags":[],"enabled":true}'`
(`channels` is required even empty — omitting it 400s). **The attach writes every
flow variable as `""`, which overrides the variable defaults** — immediately run
`cb botsourcevariable get-botvariables --botId <BOT_ID> --sourceId <src_id> --json` for the ids, then
`cb botsourcevariable post-botvariables --botId <BOT_ID> --sourceId <src_id> --body '[{"id":"botv_…","value":"…"}]'`
and verify with `cb bot get-bot-2 --id <BOT_ID> --json | jq '.sources[0].flowVariableValues'`. Any
`EnableLibraryContext: false` → fix via `closebot-edit-job-flow` before
uploading; **Smart FAQ and library files are separate retrieval paths** —
`EnableSmartFaq:true` does NOT cover library files.

## Path 1 — Smart FAQ (single Q&A)

```bash
cb smartfaq post-smart-faq --body '{"sourceId":"<src_id>","question":"Do you take insurance?","answer":"…"}'
# API returns 204; cb's followUp override GETs it back so you see the created row.
cb smartfaq post-answer --body '{"faQs":[{"id":"faq_xxx","answer":"Updated answer."}]}'   # edit existing
cb smartfaq delete-smart-faq --id faq_xxx --confirm                                        # Tier 2
cb smartfaq get-smart-faq --sourceId <src_id> --json                                       # list/verify
```
No dedup server-side — check via GET before bulk-loading; dedupe client-side.

## Path 2 — Library files, bulk FAQ, and web scrapes (manifest-driven)

```bash
cb kb build --source <src_id> --from <dir> [--faq-csv faqs.csv] [--url https://client.com/pricing]
```
Uploads every new/changed file in `dir`, runs one `--url` webscrape
(single-value — a repeated `--url` keeps only the last), loads an optional
`q|a` FAQ CSV, attaches everything to `sourceId`, and ends by calling `kb
verify`. Tracks state in `<dir>/.cb-kb-manifest.json`; on an attach failure it
exits 3 naming the orphaned `fileId` (uploaded but unattached) and never
deletes it. **`cb kb build`/`cb kb update` are unit-tested only — not yet
live-proven end to end**; there's no sandbox source in `cli/sandbox.json`
because source creation is OAuth-only. Say so when using them for a real
client.

**Reliability order for source files: TXT > CSV > DOCX > PDF.** Convert
DOCX/PDF → TXT locally before running `kb build` if possible.

**RULE: never scrape homepages** (nav/footer/marketing junk) — point `--url`
at a specific content page (`/services`, `/pricing`, `/hours`).

## In-place content update / add / remove

```bash
cb kb update --from <dir>
```
Diffs `dir` against the manifest: replaces changed files in place (multipart
`newFile` — same `fileId`, all existing source attachments preserved, so a
price fix doesn't orphan the old attach), uploads+attaches brand-new files,
and **detaches removed files with `enabled:false`** rather than deleting them.
This is the correct way to fix a stale fact in an existing file — never
re-upload a fresh copy (that orphans the old one).

Read a file's current content first (Tier 0, useful before writing the
replacement locally): `cb library get-view --fileId <file_id>` (404 on a
webscrape file — scrapes don't expose rendered content this way).

## Verify

```bash
cb kb verify --source <src_id> [--bot <bot_id>] [--from <dir>]
```
Lists attached files and flags any not ready — `ready` and `indexed` both
count as ready (`fileStatus` has no documented enum; live files report
`"indexed"`, not `"ready"`); with `--bot`, also flags Method nodes missing
`EnableLibraryContext`; with `--from`, surfaces manifest entries still
`attached:false` from a previous partial build/update.

## Sandbox-confirm the bot actually uses it

```bash
cb bot test <BOT_ID> "<a question the new content should answer>" --max-time 30
```

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Bot doesn't use uploaded content | Source not attached to bot OR `EnableLibraryContext:false` | Fix wiring before any upload (see above) |
| Bot reads FAQs but ignores library files | `EnableSmartFaq:true` but `EnableLibraryContext:false` — separate retrieval paths | Flip the flag via `closebot-edit-job-flow` |
| Edited a file but bot still quotes the old value | Re-uploaded a NEW file instead of letting `kb update` replace in place | Use `kb update --from <dir>` so the attached fileId updates in place |
| Bot deflects ("not 100% sure", "team will confirm") on hours/insurance/fees | Library file or FAQ literally says `NOT CONFIRMED. Defer` — a truth gap, not a bug | Grep files for `NOT CONFIRMED\|Defer\|TBD`; replace with the owner's words in BOTH file and FAQ (`kb-stale-vector-purge.md`) |
| Content fixed but answers flip between old and new | Stale vectors after in-place replace (`fileStatus` says indexed anyway) | Delete file → fresh upload → re-attach → recreate affected FAQs |
| Scrape returns empty | URL is JS-heavy / Cloudflare-protected | Try a different page |
| File upload fails | File too large (>~6 MB) | Split or convert to plain text |
| PDF results are gibberish | OCR failure on a scanned PDF | OCR locally first, upload as TXT |

## Historical / parallel tooling

- `references/kb-management.md` — the underlying REST endpoint inventory and
  manifest-driven build/update design this composite implements.
- `references/kb-contract-verify.py` — an independent read-only
  evaluator probe for a per-client manifest format (described in
  `kb-management.md`); `cb kb verify` is the built-in check for `cb kb`.
