
# CloseBot API Bot Build Pattern

> **Scope boundary:** this skill is bot FLOW building (duplicate → edit steps → save → attach source → save tools). For KNOWLEDGE BASE operations — source CRUD, library file upload/attach/replace, Smart FAQs, web scrapes — use `closebot-attach-knowledge`. The repo-local skill `$CLOSEBOT_DIR/skills/closebot-attach-knowledge` has further KB detail.

## The Failure (What NOT To Do)

**Initial attempts failed because:**

1. **Wrong JSON Structure**: Sent flat JSON or partial structures
   - API returned `200 OK` + `invalidPaths: []` (appears to succeed)
   - UI shows perpetual loading spinner (actually fails)
   
2. **Missing React Flow Internal Fields**: Working bots have fields like:
   - `$H` (React Flow handle ID)
   - `positionAbsolute`, `dragging`
   - `targetPosition`, `sourcePosition`
   - These are NOT in `data` - they're top-level node properties
   
3. **Building From Scratch**: Creating nodes manually loses these internal fields

## The Working Formula

```bash
# 1. DUPLICATE working bot
POST /bot/{working_bot_id}/duplicate
# Returns: {"id": "new_bot_id", ...}

# 2. RENAME
PUT /bot/{new_bot_id}
{"name": "New Bot Name"}

# 3. GET working steps (preserves ALL internal fields)
GET /bot/{source_bot_id}/steps?botVersion={version}
# Returns: {nodes: [...], edges: [...], variables: {...}, ...}

# 4. MODIFY ONLY CONTENT (never structure)
# - variables.business.overallPromptSections (Job Information)
# - Method node Instructions/Sections (conversation logic)
# - MultiObjective Objectives

# 5. SAVE with correct wrapper
POST /bot/{new_bot_id}/save
{
  "botSteps": {
    "nodes": [...],
    "edges": [...],
    "variables": {...},
    "customTools": [...],
    "enabledGlobalToolNames": [...],
    "mcpServers": [...]
  },
  "layoutOnly": false
}

# 6. ATTACH SOURCE
POST /bot/{bot_id}/source/{source_id}
{
  "tags": [{"name": "tag_name", "approveDeny": true, "id": "tag_name"}],
  "tagFilterConfig": {...},
  "channels": ["Live_Chat"],
  "enabled": true
}

# 7. SAVE TOOLS
POST /bot/{bot_id}/saveTools
[
  {"type": "SmartFAQ", "enabled": true, "options": {}},
  {"type": "SummarizeConversation", "enabled": true, "options": {"OutputVariable": ""}}
]

# 8. ASSIGN PERSONA IN UI (API cannot do this)
# Log into app.closebot.com → find bot → assign persona
```

## Critical Insights

- **API `/save` schema shows `botSteps: {}`** - it's a passthrough, not validated
- **Real validation happens in UI's React Flow renderer**
- **Always preserve ALL fields from the working bot** - never strip internal React Flow state
- **Clone then modify content** - never build node structure from scratch

## Verification

After save, verify with:
```bash
GET /bot/{bot_id}/steps?botVersion={version}
# Should return full structure with all 22 nodes, 21 edges, variables populated
```

Then check in UI - bot should open without loading spinner.