# CloseBot Tag Collision Diagnostic (CB-051)

## Problem: Bot Active Despite `ai_off` Tag

User reports: "Our front-desk staff member sent a message, then the agent sent a message. The settings should not have allowed that."

**Contact state:**
```
Tags: ['ai_off', 'ai_setter_atlas', 'contact | replied', ...]
```

Contact has **BOTH** `ai_off` AND `ai_setter_atlas` — a tag collision.

## Root Cause

CloseBot sources activate on **tag presence**, not tag exclusivity:
- `ai_setter_atlas` → activates CloseBot
- `ai_off` → meant to disable (user intent)
- But CloseBot doesn't auto-block on `ai_off` unless configured

## Diagnosis Pattern

```python
def check_tag_collision(contact_id, location_id, token):
    """Check for conflicting bot control tags that could cause race conditions."""
    contact = ghl_get(f"/contacts/{contact_id}")
    tags = contact.get("tags", [])
    
    activate_tags = ["ai_setter", "ai_setter_atlas", "ai_setter_testing"]
    block_tags = ["ai_off", "ai_setter_off", "do_not_text"]
    
    has_activate = any(t.startswith(tuple(activate_tags)) or 
                       t in activate_tags 
                       for t in tags)
    has_block = any(t in block_tags for t in tags)
    
    if has_activate and has_block:
        print(f"⚠️  TAG COLLISION: Both activation and block tags present")
        print(f"   Contact: {contact_id}")
        print(f"   Activate tags found: {[t for t in tags if t.startswith(tuple(activate_tags))]}")
        print(f"   Block tags found: {[t for t in tags if t in block_tags]}")
        return True
    return False
```

## Solutions

### Option 1: Immediate Fix (Per Contact)
Remove activation tag to deactivate bot:
```bash
ghl tags remove "ai_setter_atlas" from contact
```

### Option 2: Fix Automation Sequence
Ensure `ai_off` is applied BEFORE `ai_setter_*` activation:
```
1. Remove activation tags
2. Add ai_off
3. Send manual message
4. (Optional) Re-activate after delay
```

### Option 3: Source Configuration (Best Practice)
Configure CloseBot source with `blockTag: ai_off` to auto-skip contacts with this tag:
```python
# Configure source activation
source_config = {
    "tags": ["ai_setter_testing"],  # activation tag
    "blockTag": "ai_off",           # EXCLUDE tag
    "channels": ["Live_Chat", "SMS"]
}
```

### Option 4: Hybrid Control Pattern
Use workflow to manage state:
- `ai_setter_testing`/tag trigger ONLY controls initial activation
- `ai_off` tag added by human → removes `ai_setter_testing` first
- CloseBot reads `latest_optin` field for context, doesn't rely on tag alone

## Detection in Production

Check the `lastMessageDirection` in conversation search:
```python
conv = ghl_search_conversations(location_id, contact_id)
if conv.get("lastMessageAction") == "manual":
    pass  # manually sent
if conv.get("lastMessageDirection") == "outbound" and conv.get("lastManualMessageDate") != last_msg_date:
    print("Bot sent message AFTER manual message - race condition detected")
```

## Related Issues

- CB-050: Bot/Workflow Collision (multiple systems responding)
- CB-042: Human/Bot Identity Probe Silent Failure

## Verified

Observed live on a client location `<LOCATION_ID>` 2026-07-28:
- Contact had `ai_off` + `ai_setter_atlas`
- Bot sent message despite user intent to disable
- Tag collision confirmed via conversation search
