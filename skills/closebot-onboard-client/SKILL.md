---
name: closebot-onboard-client
description: Use when the user wants to onboard a new client into CloseBot — phrases like "set up a bot for [client]", "onboard [client name]", "spin up a CloseBot for a new client", "duplicate the [template] bot for [new client]". Orchestrates duplicate → the two UI-only gates (persona, source) → repurpose → framework parity → knowledge → sandbox-graded quality audit → the Tier 2 publish gate, delegating each step to its dedicated skill.
tools: [cb bot post-duplicate, cb bot put-bot, cb bot post-source, cb bot audit, cb source get-source]
---

# Skill: closebot-onboard-client

> Before changing anything, load the mental model: [`../../docs/HOW-CLOSEBOT-WORKS.md`](../../docs/HOW-CLOSEBOT-WORKS.md) (plugin install: `"$(cb root)/docs/HOW-CLOSEBOT-WORKS.md"`), especially §4, the safe change loop.

End-to-end onboarding for a new CloseBot client. Wraps
[`docs/playbooks/12-onboard-new-client.md`](../../docs/playbooks/12-onboard-new-client.md)'s
sequence as an orchestrator: this skill itself only duplicates, renames, and
attaches the source — every content/framework/knowledge/publish step
delegates to its own skill below.

## When to use
- "onboard [client]" / "set up a CloseBot for [client]"
- "duplicate the [template] bot for [new client]" / "spin up a new client agent"

## Do not use when
- The bot already exists and just needs one property changed → `closebot-edit-job-flow`
- Bringing an already-live bot up to framework parity → `closebot-apply-template`
- Adding knowledge to an existing client's bot → `closebot-attach-knowledge`

## Procedure
1. Confirm inputs up front: client name, CloseBot source id
   (`cb source get-source --json`, `src_...`), base bot to clone (default
   **your template bot, `$CB_TEMPLATE_BOT`** / `cb.config.json` →
   `templateBot` — if neither is set, ask; never a thin starter bot), GHL calendar id, KB content. **If the source doesn't exist yet,
   STOP** — creation is OAuth-flow-only, not API-callable (see CLAUDE.md). Send the user to `app.closebot.com` to add the GHL sub-account, then
   resume.
2. `cb bot post-duplicate --id <BASE_BOT_ID>` — creates the new bot (Tier 1).
   `cb bot put-bot --id <NEW_BOT> --body '{"name":"<Client> [DRAFT]"}'` —
   rename immediately so it doesn't get lost among "(Copy)" entries.
3. **Two UI-only gates every fresh duplicate hits — surface both, never
   skip silently:** the persona reference is unusable until reassigned in
   the bot's UI dropdown; the source is
   still the BASE bot's — attach the client's now with
   `cb bot post-source --id <NEW_BOT> --sourceId <CLIENT_SOURCE> --body
   '{"tags":[],"channels":[],"enabled":true}'`.
4. `closebot-repurpose-bot` — swaps the inherited Job Information (business
   name, address, staff, pricing, deposit) for the client's real GHL facts.
5. Tool flags, tag taxonomy, and account tools (`saveTools`) by industry —
   `references/seven-dials.md` has the matrix; apply via
   `closebot-edit-job-flow` if the client's industry differs from the base
   bot's defaults.
6. `closebot-apply-template` — only if step 4's framework-parity check came
   back `false`; splices in the recommended agent-node set.
7. `closebot-attach-knowledge` — uploads/attaches the client's KB (files,
   scrapes, FAQs) to `CLIENT_SOURCE_ID`.
8. `closebot-quality-audit` (Path A, `cb bot test`) — sandbox-grade the
   result against the rubric before publishing. Cannot run until the
   persona gate in step 3 is cleared.
9. `closebot-publish-safely` — the Tier 2 gate. Never call `/publish`
   directly from this skill.
10. `cb bot put-bot --id <NEW_BOT> --body '{"name":"<Client>"}'` — drop the
    `[DRAFT]` suffix once live.
11. Verify: `cb bot audit <NEW_BOT> --json | jq '{on: .framework_parity.on_framework, sources}'`
    — `on` must be `true` and `sources` must show the client's source, not
    the base bot's.

## Tier
Mixed — steps 2, 3, 10 are Tier 1 (reversible drafts); step 9 is Tier 2,
entirely owned by `closebot-publish-safely` and never called directly here.

## Gotchas that shaped this skill
- Source creation is OAuth-only — refuse to fake it, always stop and hand to
  the UI (see CLAUDE.md).
- A duplicate inherits the SOURCE bot's persona AND GHL source — both
  UI-only gates, both easy to skip silently (GOTCHAS.md 2026-06-22).
- Never clone a thin starter/"Template" bot (≤2 Method nodes) — thin bases
  lack the recommended agent set and shipped round-1 bots without it. Clone
  a template that passes `framework_parity.on_framework == true`.
- `saveTools` wants a raw array body, not `{tools:[...]}` — see
  `skills/learned/rest-api-spec-drift`.
- A fresh UI duplicate can arrive already `published: true` on version
  0.0.1, not always a draft — don't assume "sandbox never published" from
  bot state; `cb bot publish`'s own sandbox-id guard is the real gate
  (GOTCHAS.md 2026-09-04).

## References
- `references/seven-dials.md` — the seven customization dials (calendar,
  prompts, tool flags by industry with the full matrix, tag taxonomy,
  account tools, source attach), the inputs-to-confirm checklist, and
  playbook 12's common-failure-mode table.
