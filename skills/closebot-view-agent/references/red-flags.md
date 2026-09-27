# closebot-view-agent — full section index, red-flag catalog, and pitfalls

## The 13 report sections (`cb bot audit`, wrapping `scripts/cb-view-agent.sh`)

| # | Section | What it tells you |
|---|---------|-------------------|
| 1 | Bot meta + versions + account tools + sources | name, category, live vs draft version, attached sources, account-level tools (SmartFollowUp, SummarizeConversation) |
| 2 | Node inventory | count by node type |
| 3 | Job Information | `variables.business` — auto-detects Shape A (`overallPromptSections[]`) vs Shape B (`whyText`/`importantText`) and labels which |
| 4 | Method nodes | every `Enable*` flag, `GhlBookingCalendarId`, custom tools/MCP, and the FULL wording of each Section |
| 5 | MultiObjective nodes | each objective's title + instructions |
| 6 | Scenario nodes | type, priority, threshold, re-entry, trigger description |
| 7 | Statement nodes | fixed messages sent to the lead |
| 8 | ModifyTags nodes | tags added/removed |
| 9 | Other nodes | Source / End / Booking / etc. |
| 10 | Graph / flow | every edge as `source#id --> target#id [handle]` (ids appended so colliding titles stay unambiguous) |
| 11 | Knowledge base | per source: Smart FAQ count + library files ACTUALLY attached |
| 12 | Red-flag scan | automated findings (below) |
| 13 | Persona + voice config | the PERSONALITY layer: persona name, description, voice styles, the full `howToRespond` behavior prompt, typo %, message-breakup %, response timing, AI provider order, how many bots share this persona — plus its own red flags. Resolved from `GET /persona` (authoritative), **not** the steps payload |

## Red flags — what section 12/13 auto-detects, and what to eyeball

| Red flag | How it shows up | Why it matters |
|----------|-----------------|----------------|
| **Orphan node** (unreachable) | `⚠ ORPHAN … [Method] X` | A flow node with no inbound edge never runs. Scenario* nodes are excluded — they fire from anywhere by design, so no-inbound is normal for them. A no-inbound **Method/MultiObjective/Statement** is dead config (often a leftover from a half-finished edit). |
| **EnableGhlBooking but no calendar** | section 12 warning | Bot tries to book but has no calendar → booking fails (also a server `invalidPaths` risk on save). |
| **KB flags off** | section 12 warning | A Method node with both `EnableSmartFaq` and `EnableLibraryContext` off can't read the KB even though it's attached. |
| **Library blind despite files** (asymmetric KB footgun) | `⚠ … EnableLibraryContext=false while library files ARE attached…` (JSON `library_readability.attached_but_unreadable:true`) — added 2026-06-24 | Smart FAQ and library files are **separate retrieval paths** — `EnableSmartFaq=true` does NOT let the bot read library files. If a Method has `EnableLibraryContext=false` while the source actually has library files attached, the bot is blind to every one of them (e.g. pricing that lives only in a library `.md`). The "KB flags off" check above misses this because it only fires when BOTH flags are off. Fix: flip `EnableLibraryContext=true` via `closebot-edit-job-flow`. |
| **KB not attached** | section 11: "(none attached…)" | Files uploaded but not linked to the source. The library list is account-wide — section 11 already filters to what's truly attached. A source with 0 FAQs AND 0 files has no knowledge at all. |
| **Draft vs live drift** | section 1 banner + JSON `draft_vs_live_drift` | An unpublished draft means recent edits aren't live. The user's "fix" may not be reaching leads. |
| **Title collisions** | section 12 list | Several nodes share a title (e.g. 4× "Transfer Message"). Harmless functionally but ambiguous — the graph disambiguates with `#shortid`. |
| **Contradictory facts across nodes** | section 12 auto-scan (deposit / provider / hours) + eyeball sections 3, 4, 5 for the rest | The classic CloseBot footgun: Job Information says "$X deposit", a Method section says "no deposit required", and the MultiObjective names a different injector. Section 12 auto-detects three of these — a deposit-required-vs-no-deposit clash, >1 distinct provider/injector name, and >1 distinct business-hours statement — across Job Information + Method sections + objectives. It only fires on a genuine clash (both sides present), never on a single consistent mention. Pricing and other facts the scan can't normalize still need an eyeball: they must agree across **every** place they appear. |
| **Calendar mismatch** | section 12 (multiple distinct calendars) + section 4 | Different `GhlBookingCalendarId` on different Method nodes, or a stale calendar string hardcoded inside a Section body. |
| **Inline calendar leak** | `⚠ INLINE CALENDAR LEAK …` (added 2026-06-22) | A 20-char calendar id sits in a Method's Section/`Instructions` text but isn't a configured booking calendar — a foreign calendar buried in inline copy that a field-only swap misses. Section 4 also dumps `.data.Instructions` so this is visible. |
| **Framework gap** (structurally thin) | `⚠ FRAMEWORK GAP: missing recommended agent node(s)…` (JSON `framework_parity.on_framework:false`) — added 2026-06-22 | The bot is identity/offer/leak-clean but missing the recommended agent nodes (General Info Collection / Booking Agent / a deposit-or-readiness agent / Handle Pricing MultiObjective). This is the gap that let round-1 rebuilds ship thin. Fix by splicing the framework via `closebot-apply-template` (reference: **your template bot, `$CB_TEMPLATE_BOT`** or `cb.config.json` → `templateBot`). A rebuild/repurpose/onboard is NOT done until this reads `✓ recommended agent-node set present`. |
| **Stale brand / client name** | read section 4 prose | Leftover from a duplicated bot — old client name still in a prompt. |
| **Loose scenario triggers** | section 6 descriptions | A `ScenarioGoodbye`/`not_interested` with a too-broad trigger ends conversations early; a low threshold fires too eagerly. |
| **Tool flags vs intent** | section 4 flags | e.g. `EnableGhlBooking=true` but `EnableCheckAvailability=false` → bot books without checking slots and often fails. |
| **No persona attached** | `⚠ NO PERSONA ATTACHED` (JSON `persona.attached:false`) — added 2026-08-11 | **The bot will not reply at all.** No persona in `GET /persona` lists this bot in `botIds`, so CloseBot returns `mostRecentFailureReason:"no_persona"`. Every node-level check still reads clean, which is why this hid for so long. A freshly duplicated bot always lands here. Assignment is **UI-only** — `PUT /persona/{id}` carries an irreversible default-flip, so never "fix" it via API. Resolve before any sandbox test or publish. |
| **Persona description mismatch** | `⚠ PERSONA DESCRIPTION MISMATCH` (JSON `persona.description_is_foreign:true`) | The persona's `description` shares no identity token with this bot's name/sources — either leftover branding from the client the persona was built for, or just a generic label. Persona text lives outside the node tree, so no node-level grep can see it. Heuristic: confirm in the UI rather than trusting it blindly. |
| **Shared persona** | `• persona is SHARED by N bots` (JSON `persona.voice_flags`) | One persona commonly serves many clients' bots. Editing its `voiceStyles`/`howToRespond` changes **every** one of them. Check the shared-with list before touching persona voice. |
| **Embedded snapshot drift** | `• embedded snapshot drift` (JSON `persona.embedded_snapshot_drift:true`) | The steps payload's `.variables.persona` is frozen at save time and a duplicate carries its parent's copy forever. Informational — it explains why the payload and the UI disagree. **Always trust `GET /persona` for linkage, never the payload.** |

**Live example** — one client bot's section-12 auto-scan flagged both a
DEPOSIT CONTRADICTION (Job Information said "$50 Deposit Required" while the "General
Info Collection" section said "no deposit is required") and a PROVIDER/INJECTOR
CONTRADICTION (most nodes named one injector, one node named a different "Dr. ..., NP").
Verified live 2026-06-19 — the scan catches both with no false positives on
consistent bots.

## Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Piping the steps response through a shell var into jq | `jq: parse error: control characters … must be escaped` | CloseBot step payloads contain unescaped control chars that crash jq from a pipe but parse fine from a file — `cb bot audit`/`cb bot pull` already write to a temp file first. |
| Trusting `GET /library/files?sourceId=` to filter | Shows files from OTHER sources / phantom counts | The `sourceId` query param is IGNORED; the endpoint returns the whole account list. Filter client-side on each file's `sources[].id` (`cb bot audit` and `cb kb verify` do this). |
| Expecting an `enabled` field on library files | always null | There is no per-file `enabled`. Field names are `fileId`/`fileName`/`fileType`/`fileStatus`. Attachment is implicit via `sources[]`. |
| Flagging every Scenario node as an orphan | false positives | Scenario* nodes have no inbound edges BY DESIGN (they fire from anywhere). Orphan detection excludes them; only flow nodes count. |
| Editing `overallPromptSections` on a Shape-B bot (or vice versa) | silent no-op | Section 3 tells you which shape is populated. Only the populated one is read by the bot. |
| Viewing `0.0.1` because it was hardcoded | you read a stale version | `cb bot audit`/`cb bot version` always resolve the current target — never hardcode a version. |
| Reading only one place for a fact | missed contradiction | Pricing/deposit/hours live in Job Information AND Method sections AND objectives. Cross-check all three. |
