# CloseBot API Save vs UI Rendering Issue

## The Problem

The CloseBot `/save` endpoint accepts JSON and returns `{"invalidPaths": []}`, but **this does NOT guarantee the bot will open in the UI**.

### Validation vs Rendering Mismatch

| Check | API Result | UI Result |
|-------|------------|-----------|
| Schema validation | `200 OK` + `invalidPaths: []` | May still fail |
| Database persistence | ✅ Saved correctly | May not render |
| React Flow compatibility | ❌ Not validated | Hangs on load |

### Root Cause

The UI uses React Flow to render the visual node editor. The API's `/save` endpoint validates JSON schema but does NOT validate UI-rendering compatibility. A bot saved via API may exist in the database with correct configuration but fail to render in the browser.

## Working API Pattern

### What Works

1. **Clone via `/duplicate`** - Creates UI-compatible structure
2. **Rename via `PUT /bot/{id}`** - Works reliably  
3. **Configure tools via `/saveTools`** - Works reliably
4. **Attach source via `/source/{id}`** - Works with exact format

### What Breaks UI

**Using `/save` endpoint with modified JSON** - Even with `invalidPaths: []`, the bot may not open in the UI.

## The Correct Structure

Working bot structure from `GET /bot/{id}/steps`:

```json
{
  "nodes": [...],
  "edges": [...], 
  "variables": {...},
  "customTools": [],
  "enabledGlobalToolNames": [],
  "mcpServers": []
}
```

NOT wrapped in `botSteps`.

## Export vs Save Format Mismatch

| Endpoint | Input Format | Output Format |
|----------|-------------|---------------|
| `/export` | N/A | **KDL** (KDL Configuration Language) |
| `/save` | **JSON** with specific React Flow structure | Validation result |

**No conversion path exists** - You cannot feed KDL export into JSON save.

## Working Workflow

### Safe Approach (Recommended)

```bash
# 1. Clone (creates UI-compatible structure)
NEW_BOT=$(curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$CB_TEMPLATE_BOT/duplicate" | jq -r '.id')

# 2. Rename via API (works reliably)
curl -s -X PUT -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -d '{"name":"My Bot [DRAFT]"}' \
  "https://api.closebot.com/bot/${NEW_BOT}"

# 3. Configure tools via API (works reliably)
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -d '[{"type":"SmartFAQ","enabled":true}]' \
  "https://api.closebot.com/bot/${NEW_BOT}/saveTools"

# 4. EDIT CONTENT IN CLOSEBOT UI (safest for prompt changes)
# Don't use /save API for content modifications

# 5. Assign persona in UI (required, no API exists)
# Bot Settings → Persona dropdown
```

### Source Attachment Format

```bash
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": [{
      "name": "ai_setter_testing",
      "approveDeny": true,
      "id": "ai_setter_testing"
    }],
    "tagFilterConfig": {
      "operator": "and",
      "groups": [{
        "operator": "and",
        "rules": [{
          "tagName": "ai_setter_testing",
          "tagId": "ai_setter_testing",
          "condition": "is"
        }]
      }]
    },
    "channels": ["Live_Chat"],
    "personaNameOverride": null,
    "enabled": true,
    "flowVariableValues": {}
  }' \
  "https://api.closebot.com/bot/${BOT_ID}/source/${SOURCE_ID}"
```

## Verification

After API operations, verify structure is intact:

```bash
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/${BOT_ID}/steps?botVersion=0.0.1" | jq '{
    has_nodes: has("nodes"),
    node_count: (.nodes | length),
    has_edges: has("edges"),
    has_variables: has("variables")
  }'

# Expected:
# {
#   "has_nodes": true,
#   "node_count": 22,
#   "has_edges": true,
#   "has_variables": true
# }
```

If `node_count` is 0 or keys are missing, the bot structure is corrupted.

## UI-Only Gates

These operations require the CloseBot web UI:

1. **Persona assignment** - No API endpoint exists
2. **Prompt editing** - Use `/save` API at your own risk
3. **Visual node positioning** - API doesn't support layout

## Recovery

If a bot was corrupted by API `/save`:

1. **Delete the corrupted bot** via UI or API
2. **Re-clone** from your template bot (`$CB_TEMPLATE_BOT`)
3. **Apply changes in UI** instead of API
4. **Verify** with test session before publishing

## Session Reference

This pattern was discovered while debugging `bot_XXXXXXXXXXXXXXXX` and `bot_XXXXXXXXXXXXXXXX` on 2026-06-25. The bots accepted API saves but failed to open in the UI until rebuilt using the clone-then-UI-edit workflow.
