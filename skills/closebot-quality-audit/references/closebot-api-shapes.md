# CloseBot API Response Shapes (Verified 2026-07-06)

Captured from live API responses against a client bot (`bot_XXXXXXXXXXXXXXXX`).
These are the ACTUAL field names and structures — several differ from what
older code or skills assume.

## GET /bot/{botId} — Bot Metadata

### Top-level keys
`category`, `favorited`, `folderId`, `followUpActive`, `followUpExtraPrompt`,
`followUpRepeat`, `followUpSequences`, `followUpStates`, `followUpVarianceMinutes`,
`id`, `locked`, `modifiedAt`, `modifiedBy`, `name`, `personaIds`, `reschedulingEnabled`,
`smartFollowUp`, `sources`, `tools`, `versions`

**Key gotchas:**
- The bot name is `name` — NOT `title`. Older code looking for `.title` gets null.
- There is no `latestVersion`, `publishedVersion`, or `draftVersion` top-level field.
  These must be derived from the `versions` array.
- `category` is typically `"GHLS"` for GHL-integrated bots.

### versions[] array
Each entry: `{ version: "0.0.41", published: true|false, publishedAt: "..." }`

**Resolve live published version:**
```jq
.versions | map(select(.published==true)) | sort_by(.publishedAt) | last | .version
```

**Resolve the edit/audit target (the head version):** use `cb bot version <id>` and read `.target`,
the highest-semver version. The output is `{target, targetPublished, live, liveEqualsTarget}`.
Never use "last unpublished": once the head is published, that returns a stale old draft
(GOTCHAS 2026-07-02). Raw-HTTP equivalent on `GET /bot/{id}`:
```jq
.versions | sort_by(.version | split(".") | map(tonumber)) | last | .version
```

### sources[] array
Each entry:
```json
{
  "id": "src_XXXXXXXXXXXXXXXX",
  "category": "GHL",
  "key": "<LOCATION_ID>",   // GHL locationId
  "name": "Acme Med Spa",
  "tags": [{"name": "ai_setter_testing", "approveDeny": true, "id": "ai_setter_testing"}],
  "tagFilterConfig": {...},
  "channelList": ["SMS", "IG", "FB", "Email", "Live_Chat"],
  "personaNameOverride": null,
  "enabled": true,
  "flowVariableValues": {}
}
```

**Persona note:** `personaNameOverride` may be null even when a persona is
assigned in the UI. The `/bot` API `personaId` field also reads null for
bots that serve live with a persona bound (observed on several client bots). Do NOT treat null
as "no persona assigned" — check the UI.

## GET /bot/{botId}/steps?botVersion={ver} — Job Flow Graph

### Top-level keys
`customTools`, `edges`, `enabledGlobalToolNames`, `mcpServers`, `nodes`, `variables`

### nodes[] — types observed
`Source`, `End`, `Method`, `Statement`, `MultiObjective`, `ScenarioCustom`,
`ScenarioAggression`, `ModifyTags`

### MultiObjective node (the bot's actual prompt/instructions)
```json
{
  "type": "MultiObjective",
  "data": {
    "type": "MultiObjective",
    "name": "Objective",
    "Objectives": [{
      "Title": "Handle Pricing objection subtly",
      "Description": "...the actual prompt text...",
      "Prompt": "...short trigger phrase...",
      "Sensitivity": "50",
      "MaxAttempts": "99",
      "SkipIfNotBlank": "True"
    }]
  }
}
```

**Key:** The bot's actual system prompt lives in `.data.Objectives[].Description`
of `MultiObjective` nodes. This is the text to audit for pricing accuracy,
compliance rules, and offer truth.

### nodes[] data fields (mostly null in data)
`data.title`, `data.label` are typically null for most node types.
Node identification is by `.type` and `.id`, not by title.

### edges[] structure
Each entry has `.source` and `.target` (UUIDs matching node `.id` values).

### enabledGlobalToolNames[]
Array of strings — the tools the bot has access to (e.g., `["send_message",
"exit_method", "get_library_context", "submit_faq_question", ...]`).

### variables[]
Flow variables with `.name` and `.value`/`.default`.

## GET /source/{sourceId}/smart-faq — Smart FAQs

Array of objects:
```json
{
  "question": "...",
  "answer": "...",
  "id": "..."
}
```

Check `length` to verify KB is populated. An empty array (`[]`) means
no Smart-FAQs — the bot has no KB and will defer everything.

## POST /bot/{botId}/testSession — Create Test Session

**Request:** empty body `{}`

**Response:**
```json
{
  "leadId": "lead_test_Z3OK4DKLDOW9EYLH",
  "sourceId": "src_test_NXEXIC8PECDU1LXC"
}
```

Prefix `lead_test_` and `src_test_` distinguish test from production.

## POST /bot/{botId}/testSession/message — Send Message

**Request:** `{"leadId": "lead_test_XXX", "message": "customer text"}`

**Response:** Empty body, HTTP 200. Do NOT parse as JSON — `jq` will error
with "Expecting value: line 1 column 1". This is fire-and-forget; the
reply arrives via the SSE poll endpoint.

## GET /bot/{botId}/testSession/messages/{leadId} — SSE Event Stream

`Content-Type: text/event-stream`. Each line: `data: {JSON}`.
Connection stays open indefinitely — MUST set `--max-time`.

### Event types

| `type` | Meaning | Runner action |
|--------|---------|---------------|
| `connected` | Stream handshake | ignore |
| `logs` | Execution trace (prompts, tokens, model) | high-value debug; capture but don't display |
| `tool_use` | Bot called an internal tool | log `.toolName`, `.arguments`, `.result` |
| `action` | Action node fired | log `.actionId`, `.nodeId` |
| `activity` | UI-facing mirror of `tool_use` | de-dupe vs `tool_use` |
| `message-sent` | Final bot reply | extract `.message`; concatenate ALL (multi-message) |
| `bot_done` | Turn complete | terminal — safe to close stream |

### message-sent event shape
```json
{
  "type": "message-sent",
  "message": "Hey! Half a syringe starts at $X...",
  "messageId": "msg_XXX",
  "timestamp": "2026-07-06T15:55:48.1823408Z",
  "attachments": [],
  "isEmail": false,
  "sender": "bot"
}
```

**Multi-message replies:** A single turn can produce multiple `message-sent`
events. Concatenate ALL of them, not just the first.

## DELETE /bot/{botId}/testSession/{leadId} — Cleanup

Returns 200. Always run this — orphaned test sessions pollute the bot's
conversation state for subsequent tests.
