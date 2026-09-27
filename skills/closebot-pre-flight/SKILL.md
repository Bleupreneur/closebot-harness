---
name: closebot-pre-flight
description: Use when starting any CloseBot session that involves a specific bot — before uploading KB, editing a job flow, adding scenarios, or making any live calls. Catches source-not-attached, library context disabled, stale cross-client data in nodes, and spec drift before they waste time mid-task.
tools: [cb source get-source, cb bot audit, cb bot post-source, cb bot pull, cb bot push]
---

# Skill: closebot-pre-flight

Run this at the top of every bot work session. Five checks, under 60 seconds.
Each one maps to a real failure mode caught in production.

This is a fast *go/no-go gate* before you mutate a bot — not a full read. For
a complete config dump + red-flag scan use `closebot-view-agent`; for a
*reported* misbehavior use `closebot-debug-bot`.

## When to use
- At the top of any session that will edit, upload KB to, or add scenarios to
  a specific bot

## Do not use when
- You want the full 13-section config dump + red-flag scan → `closebot-view-agent`
- The bot has a reported failure to root-cause → `closebot-debug-bot`

## Procedure
1. `bash scripts/smoke.sh` — if it warns of spec drift, run `python3 scripts/build.py`
   before anything else.
2. `cb source get-source --json | jq '.[] | {id: .sourceId, name}'` — identify
   `SOURCE_ID` for this client.
3. `cb bot audit <BOT_ID> --json | jq '.sources'` — empty array means the
   source isn't attached; the bot's KB is invisible to it. Fix below.
4. `cb bot audit <BOT_ID> --json | jq '.method_nodes[] | {title, enableLib: .flags.EnableLibraryContext, enableFaq: .flags.EnableSmartFaq}'`
   — any `enableLib: false` must be fixed before uploading KB (below).
5. `cb bot audit <BOT_ID> --json | jq '.multiobjective_nodes'` — read the
   objective descriptions; wrong client names, prices, or services mean
   stale cross-client data (this is what a duplicated bot inherits — see
   `closebot-repurpose-bot`).
6. Verify: re-run step 3 after any fix and confirm `sources` is non-empty.

## Fix: attach source to bot
`PUT /bot/{id}` with a `sources` field does NOT work — the only correct path
is the dedicated attach endpoint. `channels` is REQUIRED (`{}` returns 400):
```bash
cb bot post-source --id <BOT_ID> --sourceId <SOURCE_ID> \
  --body '{"channels":[],"tags":[],"enabled":true}'
cb bot audit <BOT_ID> --json | jq '.sources'   # verify
```

## Fix: enable library context on a Method node
```bash
cb bot pull <BOT_ID> --out steps.json
jq --arg mid "<METHOD_NODE_ID>" '
  (.nodes[] | select(.id == $mid) | .data.EnableLibraryContext) = true
' steps.json > steps2.json && mv steps2.json steps.json
cb bot push <BOT_ID> steps.json
```
For anything beyond this one flag, hand off to `closebot-edit-job-flow`.

## Fix: stale cross-client data
1. Pull the real facts from the client's source/KB (or `scripts/ghl-business-facts.sh`).
2. Update the objective's description in `steps.json` via `jq`, alongside any
   other changes — don't save stale + new content in separate passes.
3. `cb bot push <BOT_ID> steps.json`, then verify with step 5 above.

## Failure mode map

| What you see | Root cause | Time wasted without this check |
|---|---|---|
| Bot replies correctly but ignores KB | `sources: []` OR `EnableLibraryContext: false` | Full KB upload session wasted |
| `jq` fails on source list | Response is `{total, results:[]}` not flat — `cb source get-source --json` returns the array already normalized | Re-running every source lookup |
| Bot-source attach returns 400 | `channels` field missing from body | 2-3 extra round trips |
| Bot gives wrong pricing for this client | Stale copy-paste in MultiObjective | Mid-session discovery, requires flow edit |
| Spec drift warning from smoke | Local `schema/openapi.json` stale | Wrong endpoint assumptions |

## Tier
0 — checks 1-5 are all reads. **Tier 1**: attaching a source (`cb bot post-source`)
and pushing an `EnableLibraryContext`/stale-data fix (`cb bot push`). Neither
is Tier 2 — no confirmation gate, but state intent and show the body first.

## Gotchas that shaped this skill
- `PUT /bot/{id}` with a `sources` field silently does nothing — the source
  attach endpoint is the only path that works.
- `channels: {}` on the attach body 400s; it must be `channels: []`.
- Never hardcode a version when pulling steps — `cb bot audit`/`cb bot pull`
  always resolve the current target.

## References
- `closebot-edit-job-flow` — for any fix beyond a single flag flip
- `closebot-view-agent` — full config dump + automated red-flag scan
