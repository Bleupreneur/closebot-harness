> **Correction (2026-09-05, after this note was written):** CloseBot does NOT bind
> `customParameters` values into the request — every `{{param}}` renders as
> `UNRESOLVED(param)` in test sessions and `""` at live runtime (45 spellings tried;
> see `GOTCHAS.md` 2026-09-05). Only `{{contact.*}}` tokens bind. So: parameterless
> tools and contact-token-only bodies work as described below; anything that needs
> an AI-collected value must go through `mcpServers` (MCP passes arguments as JSON)
> or be escalated to CloseBot support. Save tools with `cb bot post-savetools <id>`
> (raw JSON array) and re-attach sources with `cb bot post-source`.

# Custom Tool Integrations — extending CloseBot agents with external APIs

Verified 2026-08-25 on a sandbox bot: a Slack `chat.postMessage` custom tool posted real messages end-to-end (auth.test ok → bot invited to channel → live post → tool JSON staged).

## Working custom tool JSON schema (mirrored from live tools)

Append to `botSteps.customTools[]`. Fields: `name`, `description` (the AI reads this to decide when to call — write it as instruction), `icon`, `status: "complete"`, `wizardStep: 3`, `method`, `url`, `headers: [{id, key, value}]`, `queryParams: []`, `bodyType: "none"|"json"`, `jsonBody` (string), `formParams: []`, `customParameters: []`, `testResponse` (string — captured from a REAL call), `testVariables: [{fieldKey, descriptor, type, niceName, friendlyName, visibleToAI}]`, `restrictedFields: []`, `testValues: {}`, `isGlobalTool: false`, `requestMethod`, `body: ""`, `parameters: []`, `type: "custom_tool_<uuid>"`.

## customParameters

`[{name, description, required}]` — the AI collects the value conversationally before firing the call. Templating: the CloseBot docs say reference as `@name`; the live GHL tools in this fleet use `{{contact.id}}` curly syntax in `url` — `{{...}}` is what's proven in-bot (37 logged calls). If a parameter fails substitution in readback/testSession, flip the syntax before debugging anything else.

## The Slack Team Alert tool (verified pattern)

- `POST https://slack.com/api/chat.postMessage`, header `Authorization: Bearer $SLACK_BOT_TOKEN` (token from your environment or `<repo>/.env` — NEVER write the literal token into artifacts or skill files)
- `bodyType: "json"`; `jsonBody` includes `channel`, and a `text` using `{{contact.first_name}}`, `{{contact.last_name}}`, `{{contact.phone}}`, `{{contact.id}}` (GHL conversation deep-link `https://app.gohighlevel.com/v2/location/<LOC>/contacts/detail/{{contact.id}}?pageFrom=conversation`) plus `{{note}}`
- `customParameters: [{name: "note", description: "internal note: who they are, exactly what they need, urgency", required: true}]`
- Companion prompt rule (append to each Method): `[TEAM ALERTS: use @@[Slack Team Alert] when the lead asks for a call, needs an exception, asks what you can't answer, or books. The alert NEVER replaces replying to the lead — same turn, both actions. For call requests ALSO switch follow-up cadence to None and exit @@@[Human Handover].]`

## Wiring checklist

1. Verify the external side FIRST, before touching the bot: `auth.test` with the bot token; invite the bot into the private channel via the USER token (`conversations.invite` — bots cannot self-join private channels); send one real `chat.postMessage` into a test channel and keep the response as `testResponse`.
2. Append the tool to `customTools` AND add it to EVERY Method's `EnabledCustomTools` + `ToolOrder` (node-level — does not propagate on duplicate).
3. Save via `/save` with the `botSteps` wrapper (`layoutOnly: false`), then readback `GET /steps?botVersion=<new>` and diff.
4. `testSession`: trigger the scenario (e.g. "call me round 1:15") and verify BOTH the Slack post landed AND the lead got a reply AND the exit fired (SSE `tool_use` + `agent_exit` events).
5. UI render check before publish — `invalidPaths: []` is schema acceptance, not renderability.

## V2 — thread replies back to the lead

CloseBot cannot read Slack. External middleware (Cloudflare Worker on Slack Events `message` events filtered to threads the alert started, or any agent runtime you host) parses team replies → CloseBot API send-as-bot to the lead → remove silence tag → agent resumes with the team's answer.
