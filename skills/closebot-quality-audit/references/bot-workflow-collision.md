# CB-050: Bot/Workflow Collision Reference

## What It Looks Like

### Conversation Timeline (synthetic example)
```
T+0:00  CloseBot agent (<PersonaName>): asks for the best callback number (EN)
T+0:30  Lead: replies with a number and says they prefer Spanish (ES signal)
T+0:35  CloseBot agent (<PersonaName>): continues in Spanish (ES ✓)
T+0:40  GHL workflow message (signed "<PersonaName>"): generic English template (EN ✗)
T+1:00  Lead: answers in Spanish
T+1:00  System: Opportunity Created

Result: the lead gets an English template from "<PersonaName>" seconds after a
Spanish reply from the same persona — two senders, one name, no shared state.
```

## Detection Pattern

| Signal | Likely CB-050 |
|--------|---------------|
| "agent responded in Spanish but switched back to English when ___ responded" | YES — Workflow collision |
| Multiple messages from different "names" within same minute | YES — System collision |
| "I already told the bot ___ but then another message asked the same thing" | YES — State unawareness |
| "Are there two different people texting me?" | YES — Identity confusion |

## Systems Involved

### CloseBot AI Agent
- **Type:** Conversational AI
- **State:** Maintains conversation context
- **Language:** Adapts to customer language (incidental — LLM behavior, not explicit)
- **Trigger:** GHL tag (`ai_setter_*`) applied manually or via workflow

### GHL Workflow Message
- **Type:** Event-triggered automation
- **State:** NO conversation awareness
- **Language:** Hardcoded (usually English)
- **Trigger:** Opportunity creation, tag application, form submission

## Root Causes

### Cause A: Simultaneous Triggers
- Workflow fires on "Opportunity Created"
- AI Agent activates on same opportunity
- Both send within seconds

### Cause B: Race Condition
- Workflow delay insufficient (< 30s)
- AI Agent hasn't "claimed" conversation yet
- Customer sees both

### Cause C: Missing Guardrails
- Workflow doesn't check `ai_setter_*` tag presence
- No "conversation active" flag

## Pre-Audit Check

Before auditing, write down how the AI is activated for this location (e.g. a
tag such as `ai_setter_closebot` added by a workflow). If any OTHER workflow
also sends messages on the same trigger (opportunity created, form submitted,
tag added), collision risk is HIGH.

## Investigation Steps

1. **Get message log from GHL** — Check timestamps of "app" vs "workflow" source
2. **Map trigger events** — What fired the workflow? Opportunity? Tag?
3. **Check activation** — Is the AI activated by an `ai_setter_*` tag from a workflow?
4. **Verify language** — Does workflow have a Spanish variant? (Usually: No)

## Fix Strategies

### Tier 0 (No Publish, No Code Change)

**A. Add Delay Condition to Workflow**
```
IF: Contact has NO messages in last 5 minutes
AND: Tag "ai_setter_*" NOT present
THEN: Send workflow message
```

**B. Add Tag Check**
```
IF: Contact has tag "ai_setter_testing" OR "ai_setter_closebot"
THEN: Skip workflow message
```

**C. Extend Delay**
Change workflow delay from 0s/15s to 300s (5 min) — lets AI Agent claim conversation.

### Tier 1 (KB/Flow Update, No Rebuild)

**D. Move the Workflow Message's Intent INTO CloseBot**
- Remove workflow message entirely
- Add the equivalent question (e.g. an "Ask Occasion" classifier) to the bot
- Handle in conversation thread natively

**E. Add Language-Aware Workflow Branch**
```
IF: lastMessageBody contains "español" OR "spanish"
THEN: Send Spanish variant
ELSE: Send English variant
```

### Tier 2 (Architecture Change)

**F. Disable the Workflow Message for AI-Activated Contacts**
- Workflow checks for AI setter tags
- Skips entirely if CloseBot "owns" the conversation

**G. Unify Persona**
- If a workflow message must remain, sign it with the same persona name as the bot
- Add footer: "Reply STOP to opt out"

## Prevention Checklist

Before launching any CloseBot integration:

- [ ] Document ALL workflow triggers for location
- [ ] Test conversation flow end-to-end
- [ ] Verify no duplicate messaging
- [ ] Check language parity (workflow ↔ CloseBot)
- [ ] Add collision detection to monitoring

## Related Issues

- **CB-042** — Identity probe (customer asks "are you a bot?")
- **CB-043** — Contact pollution (prior test runs leak state)
- **CB-016** — KB vs inline conflict

## Typical Manifestation (summary)

- **Manifestation:** the bot replies in the lead's language → a GHL workflow message
  signed with the same persona name sends an English template 0–10s later
- **Root:** an "Opportunity Created" workflow fires at the same moment the AI is activated
- **Tell:** bilingual leads expose it fastest, because only one of the two senders adapts
