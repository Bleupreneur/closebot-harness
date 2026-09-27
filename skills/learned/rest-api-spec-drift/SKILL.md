---
name: rest-api-spec-drift
description: "When OpenAPI specs lie: round-trip every write endpoint before trusting it. Capture verified shapes as examples."
tools: [cb spec refresh, cb bot pull, cb bot push, cb bot post-savetools, cb kb verify]
user-invocable: false
origin: auto-extracted
---

# REST API Spec Drift Mitigation

**Extracted:** 2026-05-04
**Context:** Working with the CloseBot REST API where `schema/openapi.json` (auto-generated from upstream Swagger) is the primary documentation source.

## Problem

OpenAPI specs frequently disagree with the actual API implementation, especially for:
- Request body shape (object wrapper vs raw array)
- Response shape (full DTO vs minimal `{id}`)
- HTTP status codes (spec says 201, API returns 204)
- Query parameter requirements (marked optional but actually required)
- Polymorphic responses (extra `$type` discriminators not in spec)

Trusting the spec wastes time when the first write call returns 400 with a cryptic hint.

## Concrete drift cases discovered in CloseBot (2026-05-04)

| Endpoint | Spec said | Reality |
|---|---|---|
| `POST /bot/{id}/saveTools` | Body is `ToolInputDto` (object) | Body is **raw array** `[ToolInputDto, ...]`. Object form returns 400. |
| `POST /smart-faq` | Returns `201 Created` | Returns `204 No Content`. Empty body. Must GET to find new id. |
| `GET /bot/{id}/steps` | `botVersion` query param marked optional | **Required**. Omitting it returns 400 `botVersion field is required`. |
| `POST /library/files` | Returns `FileDto` | Returns minimal `{ "id": "file_..." }`. GET separately for full DTO. |
| `POST /bot/{id}/save` | Body schema is empty `{ botSteps: {} }` | `botSteps` value is the exact `{ nodes, edges, variables, customTools, enabledGlobalToolNames }` shape returned by `GET /bot/{id}/steps`. |
| `POST /bot/{id}/save` (version targeting) | No version param → assumed to edit "the bot" | Writes to the **latest version**: overwrites it if **unpublished**, but **forks a new draft if it's published** (e.g. 0.0.6 published → returns 0.0.7). Never hardcode `botVersion=0.0.1` on the GET — derive the latest unpublished draft: `(.versions \| map(select(.published==false)) \| last) // (.versions \| last)`. Read the returned `version` and re-pull THAT to verify. UI editor autosaves can clobber an API save (clean `invalidPaths:[]` but content reverts) — have the user close the editor tab first. |
| `GET /library/files?sourceId=X` | Filters to one source | Does **NOT** filter — returns the whole agency library. Filter client-side: `select(.sources[]?.id == $S)`. |
| Library file DTO fields | `id` / `name` / `type` / `enabled` | Real fields are `fileId` / `fileName` / `fileType` / `fileStatus`. The old names yield all-null. |
| Remove a file from a source | `DELETE /library/files/{id}` (Tier 2) | Non-destructive Tier-1 path: re-POST the attach with `{enabled:false}` → HTTP 200. Use this to retire/replace a stale doc. |
| `GET /agency/source` | Returns `{sourceId, name, category}`-ish | Also returns each source's live GHL **`accessToken` (a JWT)** in the body. NEVER print the raw response — always project safe fields: `jq -r '.results[] | "\(.sourceId)\t\(.category)\t\(.name)"'`. Shape is `{total, results:[]}`, not a flat array. |
| `GET /library/files/{id}/view` | "Get file content" | Returns 404 for `fileType: webscrape`. Webscrapes don't expose rendered content via API at all. |
| `POST /bot/{id}/saveTools` (semantics) | Implies replace | Actually merge/upsert. Sending `[]` is a no-op. Use `enabled: false` to disable. |

## Solution

### 1. Round-trip pattern (any new write endpoint)

```
1. CREATE sandbox artifact (duplicate of a real one, or fresh test entity with [TEST_MARKER] prefix)
2. READ its current state (capture the canonical shape)
3. MUTATE locally with a non-destructive marker change
4. WRITE back via the endpoint under test
5. RE-READ to confirm mutation persisted
6. CLEANUP (delete the sandbox, or document as long-lived sandbox like bot_XXXXXXXXXXXXXXXX)
```

Used in this folder for: bot `/save`, bot `/saveTools`, smart-faq CRUD, library file CRUD, webscrape CRUD.

### 2. Error response → truth mapping

| 400 error contains... | Real fix |
|---|---|
| `"could not be converted to List<X>"` | API wants raw array, spec said object — strip the wrapper |
| `"X field is required"` on a param marked optional | It's actually required — add it |
| `"could not be converted to <Type>"` (no field hint) | Body shape entirely wrong — re-read the controller class name in the error |

| Response surprise... | Document it |
|---|---|
| HTTP 204 instead of 201/200 | No body returned; must GET to find new ID |
| Response has `{id}` only, not full DTO | Spec lies; GET separately for full object |
| Response has extra `$type` discriminator | Polymorphic — capture both shapes |

### 3. Capture verified shapes as examples

Save every round-tripped request/response pair to `schema/examples/<endpoint>.json`:

```json
{
  "_request_note": "saveTools requires raw array, NOT {tools:[...]}. Sending object returns 400.",
  "_request": [{"type":"Email","enabled":true,"options":{"AdditionalPrompt":""}}],
  "_response_note": "Returns BotToolDto[] with generated id and internal $type discriminator",
  "_response": [{"id":"bottool_...", "type":"Email", "options":{"$type":"email_followup"}}]
}
```

Link from the endpoint reference doc (`docs/endpoints/<tag>.md`) so future agents see verified shape before reading the bogus spec.

Existing examples in this folder:
- `GET /bot/{id}/steps` on your own template bot — the real `/save` body shape (pull it; no client steps payload ships here)
- `schema/examples/bot.savetools.json` — saveTools array-body shape
- `schema/examples/smart-faq.create-request.json` — FAQ create
- `schema/examples/library.upload-response.json` — minimal-id response gotcha
- `schema/examples/library.webscrape-create.json` — webscrape create

### 4. Document the drift permanently in endpoint refs

In `docs/endpoints/<tag>.md`, add to any drifted endpoint:

```markdown
**Verified live YYYY-MM-DD:** [actual shape]
**Spec disagrees:** OpenAPI marks this as [wrong shape] — that returns 400.
```

## When to Use

- First time exercising any CloseBot write endpoint (POST/PUT/DELETE)
- After 400 errors with cryptic validation hints
- Before promoting a `docs/playbooks/*.md` from drafted to "verified live"
- After re-running `scripts/build.py` (spec may have shifted)

## Anti-patterns to avoid

- Inferring body shape from `additionalProperties: false` placeholder schemas
- Trusting `summary` and `OperationId` fields (CloseBot's are auto-generated to empty)
- Believing documented HTTP status without testing
- Skipping the re-read step (a 200 doesn't prove the change persisted)
- Capturing only the success case — also capture the wrong-shape 400 so the trap is documented

## Companion: smoke as drift CI

`scripts/smoke.sh` already diffs upstream spec hash vs local copy. When it reports drift, treat ALL `schema/examples/*.json` as suspect until re-verified. The smoke test is currently green; spec is in sync as of 2026-05-04.

## Permanent sandbox

Use the sandbox bot allowlisted in `cli/sandbox.json` (copy `cli/sandbox.example.json`; e.g. `bot_SANDBOXXXXXXXXXX`) — a duplicate of your template bot used to verify `/save` and `/saveTools` round-trips. Mark test edits with a `[TEST_MARKER]` string so they're easy to find. Never publish it. `DELETE /bot/{id}` can 500 on fresh bots (see GOTCHAS.md); delete in the UI if so.
