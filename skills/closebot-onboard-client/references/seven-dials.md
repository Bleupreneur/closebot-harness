# The seven customization dials

These are the only things that should differ between clients cloned from the
same base bot. `closebot-repurpose-bot` owns dial 1 (Job Information); the
rest are checked here during onboarding.

## Dial 1 — Calendar IDs
Every `Method` node's `data.GhlBookingCalendarId` and every `Booking` node's
`data.CalendarId`, plus any inline calendar-id string literal inside
`Sections[].Body` or `Instructions`. `closebot-repurpose-bot` and
`closebot-apply-template` both sweep this with `walk()` over the whole
payload, not just Section bodies — see
`closebot-edit-job-flow/references/mutation-recipes.md`.

## Dial 2 — Prompts
`Instructions` + `Sections[*].Body` per Method node. Ask the user for brand
voice notes, service descriptions, hours, and pricing, then rewrite with
`jq` (via `closebot-edit-job-flow`'s recipes). Keep structural footers the
base bot has worked into the prompt: "plain text only / no symbols," and the
booking-agreement language ("must clearly agree to a time").

## Dial 3 — Tool flags (by industry)

| Tool | Med spa | Real estate | Gym | Service biz |
|---|:-:|:-:|:-:|:-:|
| `EnableUpdateContact` | yes | yes | yes | yes |
| `EnableAddTag` | yes | yes | yes | yes |
| `EnableCheckAvailability` | yes | yes | yes | yes |
| `EnableGhlBooking` | yes | yes | yes | yes |
| `EnableModifyAppointment` | yes | no | yes | yes |
| `EnableGetPropertyDetails` | no | yes | no | no |
| `EnableSendPropertyImage` | no | yes | no | no |
| `EnableCheckDistance` | optional | yes | no | optional |
| `EnableSmartFaq` | yes | yes | yes | yes |
| `EnableEmail` | optional | yes | no | optional |
| `EnableLibraryContext` | yes (if KB) | yes (if KB) | yes (if KB) | yes (if KB) |

Apply via `closebot-edit-job-flow` (bulk-flip flags across all Method nodes
in one mutation, same as any other property edit).

## Dial 4 — Tag taxonomy
`ModifyTags` nodes. Inspect what the base bot ships with, then replace with
the client's GHL tag conventions. Common nodes to update: `human_handover`,
`emergency_human_handover`, `not_interested`, `ai_aggression_detected`.

## Dial 5 — Account tools (`saveTools`)
`POST /bot/{id}/saveTools` (`cb bot post-savetools`) takes a **raw array
body**, not `{tools:[...]}`:
```json
[
  {"type":"SmartFAQ","enabled":true,"options":{}},
  {"type":"Email","enabled":true,"options":{"AdditionalPrompt":"Concise. Match brand voice."}},
  {"type":"SummarizeConversation","enabled":true,"options":{"OutputVariable":null}}
]
```

## Dial 6 — Source attach
`cb bot post-source --id <NEW_BOT> --sourceId <CLIENT_SOURCE> --body
'{"tags":[],"channels":[],"enabled":true}'` — this is the step that keeps
the bot pointed at the BASE bot's client if skipped (see Gotchas in
`SKILL.md`).

## Dial 7 — Knowledge
Delegated entirely to `closebot-attach-knowledge`.

## Inputs to confirm with the user upfront

```
Onboarding new CloseBot client. I need:
  1. Client name: ?
  2. CloseBot source ID for them (src_...): ? — if none, add via UI first
  3. Industry / which template bot to clone from: ?
  4. GHL calendar ID (if booking): ?
  5. KB content: any files? URLs to scrape? FAQ pairs from discovery call?
  6. Brand voice notes (tone, "must say" / "never say"): ?
```

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Source doesn't exist | OAuth-only creation, not yet added | Stop, direct to UI, resume after |
| Base bot version mismatch | Assumed `0.0.1` on an existing (not freshly created) base | `cb bot version <id>` always resolves the real target — never hardcode |
| `invalidPaths` non-empty after a push | Typo or removed required prop | `cb bot push` already surfaces the exact paths — fix and retry |
| Sandbox test mentions the old brand | Dial 2 (prompts) incomplete — the base brand often appears in 3-5 places | Re-scan Sections bodies and Instructions |
| `saveTools` 400 | Body sent as `{tools:[...]}` | Send the raw array (see Dial 5) |
| Publish 400 | Latest save had non-empty `invalidPaths` | Re-save cleanly via `closebot-edit-job-flow` first |
