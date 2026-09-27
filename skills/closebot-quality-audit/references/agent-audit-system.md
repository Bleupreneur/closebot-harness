# Agent-Audit System Reference

> **Blueprint only — none of these scripts ship with this repo; build them
> yourself or use the cb equivalents listed.** Every `scripts/*.sh`,
> `clients/registry.json` and `.claude/skills/*` path below lives in a
> separate workspace YOU would create. Nothing here is runnable as-is.
>
> | Blueprint script | Use this instead (ships with this repo) |
> |---|---|
> | `client-lookup.sh` | `cb map` (whole-account inventory) / `cb bot list` |
> | `audit-read.sh`, `audit-flow.sh` | `cb bot version <id>`, `cb bot pull <id>`, `cb bot audit <id> --json` |
> | `audit-kb.sh` | `cb smartfaq get-smart-faq`, `cb library get-files-2` + `cb library get-view --fileId <id>`, `cb kb verify --source <src>` |
> | `audit-test.sh`, `audit-scenario.sh` | `cb bot test <id> "message"`, `references/scripts/multi-offer-probe.sh` |
> | `audit-update.sh` | `cb bot pull` → edit `steps.json` → `cb bot push`; `cb smartfaq post-smart-faq` / `delete-smart-faq`; `cb kb update --from <dir>` |
> | `audit-fleet.sh` | `bash scripts/cb-audit-loop.sh --fleet`, `bash scripts/cb-view-agents-fleet.sh` |

A reference architecture for a standalone audit workspace (`$AGENT_AUDIT_DIR/`)
that sits next to this repo and wraps its CLI into per-client audit scripts.
It is not shipped here — use this file as a blueprint if you run audits across
many client bots. The script names below are the suggested layout.

## Location
`$AGENT_AUDIT_DIR/` — a separate git repo you create (keeps client data out of
this repo).

## Auth
`CLOSEBOT_API_KEY` loaded from this repo's `.env`. All scripts
auto-load it. No Airtable, Supabase, or OAuth tokens needed for Path A
(testSession sandbox).

## The Agent Agency (4 roles + self-healing loop)

Based on the harness framework: a small agency of dumb-but-reliable agents,
not one genius agent. Each agent has: Prompt (job description), Context
(what to load and when), Tools (clean API mappings), Memory (3 buckets:
short/long/reflection), Harness (guardrails), Loop (plan→inspect→act→
observe→verify→fix→document).

| Agent | Skill (in-repo) | Job | Tier |
|-------|-----------------|-----|:----:|
| Builder | `builder-agent` | Create, inspect, edit, validate, test, publish bots | 0-2 |
| QA | `qa-agent` | Break the bot before leads do — 6 test personas + 4-dim rubric | 0 |
| Librarian | `librarian-agent` | Keep client context clean — sync KB with ad copy, update registry | 0-1 |
| Error Doctor | `error-doctor` | Read logs, diagnose root causes, prescribe fixes | 0-1 |
| Self-Healing | `skill-retro` | After audit work, background agent reviews skills, fixes issues, logs gotchas | 0 |

The `skill-retro` loop: after audit work, spawn a background delegate that
reviews each skill used, checks if the script did what the SKILL.md says,
looks for bugs, runs scripts against a live client to verify, fixes issues
in-place, and logs new gotchas to `GOTCHAS.md`. This was
validated in-session: the background agent found and fixed 3 real bugs
(stale-draft version heuristic, null-safety on job shape detection, 404
JSON handling for webscrape files) without being asked.

## Scripts (in scripts/)

### client-lookup.sh
Instant lookup from registry.json — zero API calls, <50ms.
```bash
scripts/client-lookup.sh                    # list all clients
scripts/client-lookup.sh acme           # full dossier
scripts/client-lookup.sh acme --offers  # offers + pricing
scripts/client-lookup.sh acme --bot     # just bot ID
```

### audit-read.sh — 12-section overview
Full 12-section bot config dump. Uses highest semver across ALL versions
(NOT "last unpublished draft" which resurrects stale drafts on published-head
bots — known trap documented in GOTCHAS.md).
```bash
scripts/audit-read.sh acme              # highest version (incl. draft), human report
scripts/audit-read.sh acme --live       # published version only (what leads see now)
scripts/audit-read.sh acme --json      # machine-readable
scripts/audit-read.sh --fleet              # all clients, status table
```

**12 sections:**
1. BOT META — name, versions, sources, channels, tags, persona
2. NODE INVENTORY — total + breakdown by type
3. JOB INFORMATION — variables.business (Shape A: overallPromptSections, Shape B: whyText/importantText)
4. METHOD NODES — tool flags, calendar, sections, instructions
5. MULTIOBJECTIVE — objectives (pricing rules, booking directives)
6. SCENARIO NODES — triggers (aggression, handover, pricing inquiry)
7. STATEMENT NODES — fixed messages
8. MODIFYTAGS — tag side effects
9. OTHER NODES — Source, End, Booking
10. GRAPH / FLOW — edge map
11. KNOWLEDGE BASE — Smart FAQ count + library files per source
12. RED-FLAG SCAN — orphans, framework gaps, library readability

### audit-kb.sh — Full KB content
Dumps the actual content of the Knowledge Base: every Smart FAQ Q&A pair (not
just the count) and the rendered text of every attached library file via
`GET /library/files/{id}/view`. Use when you need to see what the bot actually
knows — the real prices, answers, and facts it has access to.
```bash
scripts/audit-kb.sh acme               # all FAQs (Q&A) + library file contents
scripts/audit-kb.sh acme --faqs          # Smart FAQs only (full Q&A pairs)
scripts/audit-kb.sh acme --files         # library file contents only
scripts/audit-kb.sh acme --json          # machine-readable
```

### audit-flow.sh — Full agent flow
Focused read of the agent's conversational logic: Job Information (auto-detects
Shape A vs B), Method node sections + instructions + flags, MultiObjective
objective instructions, Scenarios, Statements, ModifyTags, and the graph.
```bash
scripts/audit-flow.sh acme              # full flow
scripts/audit-flow.sh acme --live        # published version
scripts/audit-flow.sh acme --job-info    # Job Information only
scripts/audit-flow.sh acme --methods     # Method nodes only
scripts/audit-flow.sh acme --objectives  # MultiObjectives only
scripts/audit-flow.sh acme --scenarios   # Scenarios + Statements + ModifyTags
scripts/audit-flow.sh acme --json        # machine-readable
```

### audit-test.sh — Sandbox testing
Send messages via testSession sandbox. No carrier cost, no contact created.
```bash
scripts/audit-test.sh acme "Hi" "How much is lip filler?" "Can I book?"
scripts/audit-test.sh acme --interactive
scripts/audit-test.sh acme --file turns.txt
```

### audit-scenario.sh — Scenario runner
```bash
scripts/audit-scenario.sh acme scenarios/acme-pricing.md
```

### audit-update.sh — Update KB or agent flow (Tier 1)

**KB updates (no publish needed — live on re-index):**
```bash
scripts/audit-update.sh acme --faq-list
scripts/audit-update.sh acme --faq-add "How much is Service A?" "$X/unit"
scripts/audit-update.sh acme --faq-add-file faqs.csv
scripts/audit-update.sh acme --faq-edit faq_xxx "new answer"
scripts/audit-update.sh acme --faq-delete faq_xxx
scripts/audit-update.sh acme --file-list
scripts/audit-update.sh acme --file-view file_xxx
scripts/audit-update.sh acme --file-replace file_xxx new.txt
```

**Agent flow updates (saves draft — publish via closebot-publish-safely):**
```bash
scripts/audit-update.sh acme --job-info --why "text" --biz "text"
scripts/audit-update.sh acme --method "Booking Agent" --instructions "new text"
scripts/audit-update.sh acme --method "Booking Agent" --section "Title" "new body"
scripts/audit-update.sh acme --method "Booking Agent" --flag EnableSmartFaq true
scripts/audit-update.sh acme --method "Booking Agent" --calendar "cal_id"
scripts/audit-update.sh acme --method-all --flag EnableLibraryContext true
scripts/audit-update.sh acme --objective "Handle Pricing" --instructions "Use the KB"
scripts/audit-update.sh acme --graph
scripts/audit-update.sh acme --diff
```

### audit-fleet.sh
```bash
scripts/audit-fleet.sh --smoke
scripts/audit-fleet.sh scenarios/general-pricing-smoke.md
```

## .claude/ directory (skills + gotchas)

```
.claude/skills/
├── audit-loop/SKILL.md        # canonical 7-phase workflow
├── audit-kb/SKILL.md          # KB read skill (FAQs + library files)
├── audit-flow/SKILL.md        # flow read skill (Job Info, Methods, Objectives)
├── audit-update/SKILL.md      # update skill (FAQ CRUD, file replace, Method edits)
├── builder-agent/SKILL.md     # Agent 1: build/edit/validate/test/publish
├── qa-agent/SKILL.md          # Agent 2: 6 test personas + 4-dim rubric
├── librarian-agent/SKILL.md   # Agent 3: keep client context clean
├── error-doctor/SKILL.md      # Agent 4: read logs, diagnose, prescribe fixes
├── skill-retro/SKILL.md       # self-healing: background agent reviews + fixes
└── GOTCHAS.md                 # running gotchas log (newest first)
```

Each agent skill has the full harness: Prompt, Context (incremental loading),
Tools (20-30+ API operations mapped to scripts), Memory (3 buckets), Harness
(guardrails), Loop.

## Per-client folder pattern

Each client has `clients/<slug>/` with:
- `CLAUDE.md` — client primer (bot ID, source, calendar, offers as ad copy)
- `ISSUES.md` — audit findings log (CB-XXX issue IDs, root cause, status)
- `CHANGELOG.md` — what was changed and when

## Registry (clients/registry.json)

Single JSON file with all clients. Each entry has:
- name, owner, location_id, platform (closebot or ghl-native)
- bot_id, bot_name, live_version, source_id, calendar_id
- persona, activation method, deposit
- offers[] array with name, ad_copy, pricing{}
- notes (gotchas, auth quirks)

## Audit-loop workflow (the canonical loop)

1. READ (Tier 0, three depth levels): audit-read.sh, audit-kb.sh, audit-flow.sh
2. TEST → audit-test.sh (Tier 0)
3. GRADE → 4-dimension rubric, log to ISSUES.md
4. ADJUST (Tier 1): audit-update.sh for KB/flow, closebot-* skills for complex
5. RETEST → audit-test.sh
6. PUBLISH → closebot-publish-safely (Tier 2, explicit confirm)
7. RECORD → update ISSUES.md + CHANGELOG.md + registry.json

## Tier discipline
- Tier 0 (GET): read freely
- Tier 1 (POST/PUT mutate draft): state intent, show body, proceed if no objection
- Tier 2 (publish/DELETE): explicit same-turn confirmation, NEVER chained

## Offer-agnostic design principle (CRITICAL)

Every bot must be offer-agnostic — NO offer-specific pricing in Job Info,
Method sections, or MultiObjective. All pricing lives in the KB (Smart FAQs +
library files). A bot with hardcoded pricing is a FAIL. If your template bot
carries pricing in the agent, move it to the KB before cloning from it.

## Commit policy
Commit at every checkpoint. Push only when asked.

## MultiObjective overrides KB (pricing gotcha, learned live 2026-07-06)

A MultiObjective node's instructions sit in the system prompt — the LLM
prioritizes them over KB (RAG) retrieval. If "Handle Pricing" says "Service A is
$20/unit" and the KB Smart FAQ says "$10/unit (offer)", the bot quotes $20.
Fixing the KB alone is NOT enough: strip all specific pricing from the
MultiObjective and replace with "Look up all pricing from the KB", then
publish (a flow edit requires publish). Full procedure:
`kb-deconstruction-rebuild.md`.

## Persona binding is invisible to the API (verified live 2026-07-06)

A persona bound to a bot in the CloseBot UI does not show up in the `/bot`
API: `personaId` reads null even when the UI shows the persona attached, and
the bot's display name may still read an older persona name (cosmetic only).
Confirm persona binding in the UI, not from `personaId`.

Keep your own fleet roster (client → bot id → live version) in
`$AGENT_AUDIT_DIR/clients/registry.json` and re-verify versions against the
live API before trusting them.
