
# CloseBot KB Management

API patterns and tooling workflow for CloseBot knowledge bases: sources, library files, Smart FAQs, web scrapes. Auth: header `X-CB-KEY` with `CLOSEBOT_API_KEY` (export `CLOSEBOT_API_KEY` or put it in `<repo>/.env` (`cp .env.example .env && chmod 600 .env`)). Base: `https://api.closebot.com`. The repo-local skill `$CLOSEBOT_DIR/skills/closebot-attach-knowledge/SKILL.md` has additional playbook detail — read it for edge cases beyond this inventory.

## Critical rules (each is a known #1 failure mode)

1. **Every upload MUST be attached.** Upload (`POST /library/files`) only puts the file in the agency library; no bot sees it until `POST /library/files/{fileId}/source/{sourceId}` with body `{"tags":[],"channels":[],"enabled":true}`. Structure tooling so upload and attach are one atomic step.
2. **Smart FAQ POST returns 204 with no body.** Verify via `GET /smart-faq?sourceId=X`, never from the POST response.
3. **`GET /library/files?sourceId=X` does NOT filter** — it returns the entire agency library. Filter client-side on `.sources[].id`. Real field names are `fileId`/`fileName`/`fileType`/`fileStatus` (NOT `id`/`name`/`type` — those yield nulls). There is NO `GET /source/{id}/files` endpoint (404 — an independent verifier guessed it 2026-07-18); the client-side library filter is the only way to list a source's attachments.
4. **Update content with `PUT /library/files/{fileId}` (multipart field `newFile=@...`), never re-upload.** PUT preserves the fileId and every source attachment; re-upload orphans the old file and breaks the attach.
5. **Reliability order: TXT > CSV > DOCX > PDF.** Convert DOCX/PDF → TXT locally before upload (`python-docx`, `pypdf`). Upload the converted `.txt`.
6. **`GET /agency/source` returns `{total, results[]}`** — iterate `.results[]`, not `.[]`. Source list entries carry `sourceId`; single-source GET carries `id`.

## Verified endpoint inventory (live-tested 2026-07-18)

| Operation | Call | Notes |
|---|---|---|
| Create source | `POST /agency/source` body `{"name": NAME, "category": "WebHook"}` | Returns SourceDto; ID at `.id` (fall back to `.sourceId`). Works for KB-only sources with no CRM. |
| Find source by name | `GET /agency/source?query=NAME&pageSize=100` | Exact-match `.name` client-side; response is paginated `{total, results[]}`. |
| Get source | `GET /agency/source/{id}` | `.name`, `.id` |
| Upload file | `POST /library/files` multipart field `file` | Returns `.id`. Limit ~6 MB (413 past that). |
| Attach file/scrape | `POST /library/files/{fileId}/source/{sourceId}` body `{"tags":[],"channels":[],"enabled":true}` | Re-POST with `enabled:false` to retire non-destructively. |
| Replace file bytes | `PUT /library/files/{fileId}` multipart field `newFile` | Preserves fileId + attachments. Returns updated file. |
| Read file content | `GET /library/files/{fileId}/view` | Raw text bytes. 404 on webscrape files (confirmed live 2026-07-18 — a scrape file's content is NOT retrievable via /view; do not treat the 404 as missing content). |
| Delete file | `DELETE /library/files/{fileId}` | Removes from all sources. Confirm before use. |
| Create Smart FAQ | `POST /smart-faq` body `{"sourceId","question","answer"}` | 204, no ID back. No dedup — check via GET first. |
| List FAQs | `GET /smart-faq?sourceId=X` | Returns array. |
| Web scrape | `POST /library/webscrape` body `{"scrapeUrl","maxBreadth":1,"maxDepth":1}` | Returns `.id`; attach like a file. Never scrape homepages. |

Rate limits: bounded concurrency ≤3 in-flight; retry 429/5xx with exponential backoff (base 2s, ~5 attempts for mutations).

## Manifest-driven build/update/audit tooling

The shipped implementation is `cb kb build|update|verify` (see `cli/README.md`). These design rules apply to it and to any KB tool you write yourself:

- **Manifest is durable state**, keyed by EXACT client name. Per file record: `{fileId, fileName, sha256, localPath, uploadedAt}`. Never write the API key to it.
- **`buildComplete` flag resolves the resume-vs-collision conflict.** A re-run of the same build command must resume a killed build (skip files already in manifest) but refuse to duplicate a completed build. Set `buildComplete: false` at entry creation, `true` only after final verification passes. Re-run with manifest entry present: incomplete → resume; complete → refuse without `--force`.
- **Verify after every mutation phase**: re-pull the source's attached files (client-side filter, rule 3) and assert every manifest fileId is present. Smart FAQs verified via GET count + spot-check.
- **Destructive removals need an explicit confirm flag**: without it, report and exit non-zero leaving remote state untouched.
- **Fuzzy client match**: exact match required; on near-match, list candidates and require interactive confirmation — never proceed silently (cross-client writes are the catastrophic failure).
- **Audit is read-only**: instrument the HTTP client with a mutation log so you can prove zero POST/PUT/DELETE during audit runs.

## Pitfalls

- **ThreadPoolExecutor + `as_completed` loop-variable capture**: when collecting results, store per-future context IN the futures dict — `futures[pool.submit(fn, orig, path)] = (orig, relpath)` — and read it back from `futures[fut]`. Referencing the outer submission-loop variable in the result handler gives you the LAST iterated value for every future (bit me on `localPath` in a bulk uploader; every manifest entry pointed at the last file).
- **Validate ALL inputs before creating the source** (dir non-empty, CSV parses, URLs well-formed). Validation-after-create leaves orphan empty sources on bad input.
- **DOCX/PDF conversion needs the right interpreter**: keep a project venv (`python-docx`, `pypdf`) and point the tool's shebang at it; system python on macOS lacks both.
- **`POST /bot/{bot_id}/source/{source_id}` body requires `channels` even when empty** — `{"channels":[],"tags":[],"enabled":true}`, else 400. (Bot-side attach; usually out of KB-tool scope.)
- **A "force rebuild" must not fall into find-by-name recovery (bug hit 2026-07-18 in a standalone KB builder).** A `--force` branch that resets the manifest entry with an empty `sourceId` and then falls through to a shared "create source if missing" block will run the find-source-by-name lookup and silently re-bind to the OLD source — uploading duplicates and orphaning old fileIds. Fix: inside the force branch, skip the name-reuse lookup and create the new source directly; warn that two sources now share a name, naming the existing sourceId. Keep name-reuse recovery for non-force fresh builds only (the "manifest deleted but source exists remotely" case).
- **Webscrape is async — submit-time success ≠ content.** `POST /library/webscrape` returns a fileId immediately and scrapes server-side later; an unreachable/invalid-domain URL still returns a fileId and the tool reports "✓ scrape." There is no synchronous failure signal. If correctness matters, poll the file (status field) after submit rather than trusting the 200.
- **Webscrape files 404 on `GET /library/files/{id}/view`** — scraped content is not retrievable that way, so byte-fidelity checks only apply to uploaded files.
- **There is no `GET /source/{id}/files`** (404) — list `/library/files` and filter client-side.
- **Auth is `X-CB-KEY`, not Bearer.** An out-of-band verifier sending `Authorization: Bearer $CLOSEBOT_API_KEY` gets 401 (bit an independent verifier 2026-07-18). When writing throwaway probes/verifiers, copy the header from `references/kb-contract-verify.py`, not from generic REST habit.

## Verifying a repair (reusable method)

1. Fresh unique test-client name per re-test; never reuse earlier test clients.
2. Verify the repaired path with INDEPENDENT API reads (your own script, not the tool's code): identity inequality (new ≠ old), old object untouched (pre-registered fileId list), new object correct, the durable-state pointer (manifest) updated, and any warning text emitted — each as a separate check.
3. Confirm the guard-rail in the same area still works (the refuse-without-flag path), so the fix didn't just remove the protection.
4. Spot-check adjacent behaviour with cheap probes (in-place replace keeps the fileId, removal gate, read-only audit via before/after state diff, invalid input fails cleanly) rather than re-running everything.
5. Leave test sources for manual cleanup in the UI, and end with an explicit PASS/FAIL.

## Support files

- `references/kb-contract-verify.py` — independent read-only evaluator probe for a per-client manifest (`{"version":1,"clients":{"<name>":{"sourceId","files":{"<local>":{"fileId","sha256",...}},"faqs":[...]}}}`, default path `<repo>/.closebot-manifest.json`, override with `--manifest`). Asserts remote state (source name, attachments both directions, per-file /view sha256 == manifest, FAQ presence) WITHOUT reusing the tool-under-test's code. For `cb kb`, `cb kb verify` is the built-in equivalent. Use it to grade upload/attach/byte-fidelity ACs out-of-band instead of trusting the tool's own "✓" output. `python3 kb-contract-verify.py <client|--all>` with `CLOSEBOT_API_KEY` set; exit non-zero on any FAIL.
