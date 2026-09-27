# Workflow: closebot-view-agents (parallel fleet view)

View **many CloseBot bots at once**, read-only, and produce a consolidated comparison
plus a per-bot red-flag summary. This is the fan-out companion to the single-bot
`closebot-view-agent` skill.

**Tier 0 — read-only.** Every underlying call is a GET (`GET /bot`, `GET /bot/{id}`,
`GET /bot/{id}/steps`, `GET /smart-faq`, `GET /library/files`). This workflow makes **no
mutations** and **never publishes**. It is safe to run any time without confirmation.

> The harness Workflow runner is JS; this file is a documented spec + a shell runner the
> user (or an agent) executes directly. It is **not** auto-executed.

## When to use

- "view all my bots" / "audit the whole fleet"
- "which bots are missing the objection/transfer flow?"
- "compare how every bot is set up"
- "which bots have unpublished drafts / no KB / orphan nodes?"
- "show me every bot that books calendar X" (read the per-bot JSON, grep the calendar)

For a single bot, use the `closebot-view-agent` skill instead.

## How it works

```
GET /bot ──► list of bot ids
                │  (or an explicit list the user supplies)
                ▼
     fan out, N at a time (default 4)
                │
   scripts/cb-view-agent.sh <id> --json   ◄─ one structured object per bot
                │
                ▼
   combine → fleet.json (array)
                │
        ┌───────┴────────┐
        ▼                ▼
  comparison table   red-flag summary
```

Each per-bot dump is the exact same JSON the single-bot skill emits with `--json`:
`{ bot_id, name, inspected_version, live_version, draft_version, draft_vs_live_drift,
account_tools, sources, job_information, node_inventory, method_nodes, multiobjective_nodes,
scenario_nodes, statement_nodes, modifytags_nodes, other_nodes, edges, orphan_nodes,
title_collisions, knowledge_base }`.

## Run it

```bash
# every bot in the account
bash scripts/cb-view-agents-fleet.sh

# an explicit set
bash scripts/cb-view-agents-fleet.sh bot_AAAA bot_BBBB bot_CCCC

# widen the fan-out (more parallel GETs)
bash scripts/cb-view-agents-fleet.sh --concurrency 8
```

Outputs:
- a **comparison table** (one row per bot): id, name, inspected/live version, drift,
  node count, Job Information shape, orphan count, total Smart FAQs, total library files.
- a **red-flag summary** per bot (draft drift, booking-without-calendar, KB-off Methods,
  sources with zero knowledge, multiple booking calendars).
- `fleet.json` — the full array, for any custom query you want to run.

## Custom fleet queries (read the combined JSON)

```bash
FLEET=/path/to/fleet.json   # printed at the end of the run

# Bots with an unpublished draft (edits not live)
jq -r '.[] | select(.draft_vs_live_drift) | "\(.bot_id)  \(.name)  draft \(.draft_version) vs live \(.live_version)"' "$FLEET"

# Bots with any orphan (unreachable) flow node
jq -r '.[] | select((.orphan_nodes|length)>0) | "\(.bot_id): \([.orphan_nodes[].title]|join(", "))"' "$FLEET"

# Which calendar does each bot book?
jq -r '.[] | "\(.name): \([.method_nodes[].calendar]|map(select(.!=null and .!=""))|unique|join(", "))"' "$FLEET"

# Bots whose Job Information uses Shape B (whyText/importantText)
jq -r '.[] | select(.job_information.shape|startswith("B")) | "\(.bot_id)  \(.name)"' "$FLEET"

# Bots missing a given flow node (e.g. no "Human Handover" scenario)
jq -r '.[] | select([.scenario_nodes[].title] | any(test("Human Handover"))|not) | "\(.bot_id)  \(.name) — no Human Handover scenario"' "$FLEET"

# Sources with no knowledge at all
jq -r '.[] | .knowledge_base[] | select(.smart_faq_count==0 and (.library_files|length)==0) | "\(.source_name) (\(.source_id)) — 0 FAQ, 0 files"' "$FLEET"
```

## Safety notes

- **Read-only.** No call in this workflow mutates state. Do not add a POST/PUT/DELETE step
  here — fleet-wide writes belong in `closebot-bulk-fanout`, which enforces per-target
  confirmation for Tier 2.
- **Concurrency.** Default 4 parallel bots keeps you well under any rate-limit concern
  (rate limits are undocumented — see the CLAUDE.md gap registry). Raise it only if the run
  is slow and you see no 429s.
- **Spec drift.** If a per-bot dump comes back `{"error":true}`, view that one bot alone
  with `scripts/cb-view-agent.sh <id>` to see the raw error (key, missing bot, or schema drift).

## Hand-off

This workflow only reports. To act on a finding:

| Finding | Skill |
|---------|-------|
| A bot needs a property/flag/prose edit | `closebot-edit-job-flow` |
| A bot is missing the recommended agent-node set | `closebot-apply-template` |
| A bot needs a scenario added | `closebot-add-scenario` |
| A source needs knowledge | `closebot-attach-knowledge` |
| A draft needs to go live | `closebot-publish-safely` |
| A mass write across many bots | `closebot-bulk-fanout` (Tier-2-safe fan-out) |
| Deep-dive one bot | `closebot-view-agent` |
```
