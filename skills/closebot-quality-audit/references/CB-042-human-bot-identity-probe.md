# CB-042 — Human/Bot Identity Probe Silent Failure

**Severity:** FAIL (HIGH)  
**First Identified:** 2026-07-01 (client lip-filler bot audit, lead_XXXXXXXXXXXXXXXX)  
**Status:** OPEN

## Symptom

Customer asks "am I speaking with a person?" / "are you a bot?" / "are you AI/human?" → bot emits NO response → customer retries with "hello" → complete disengagement/silence.

**Tester Feedback Pattern:**
> "when I asked 'am I speaking with a person?' it never responded...after a little bit I replied with 'hello' and all engagement ended"

## Root Cause

Scenario classifier has no explicit handler for human/bot identity probes. Query falls through to:
- Unclassified intent terminus (silent), OR
- Misclassified as disengage/not_interested

This is NOT the same as CB-004 (silent handover on medical triggers like pregnancy).

## Why This Is Critical

- **#1 skepticism trigger:** Most common question when users suspect AI
- **Trust breach:** Silence confirms suspicion negatively
- **TCPA/CASL adjacent:** In regulated channels, bot disclosure may be required
- **Medspa context:** Patients need confidence before booking invasive procedures

## Fix Surface

**CloseBot Job Flow:**

1. **Scenario classifier:** Add explicit detection for identity-probe intents:
   - "are you a bot/person/AI/human/robot/real?"
   - "am I speaking with...?"
   - "is this automated?"
   - "who am I talking to?"

2. **Response node:** Warm, transparent, on-brand disclosure:

```
"I'm Mia, an AI assistant here at Acme Med Spa. I can help answer 
questions about our treatments, check availability, and get you booked — 
and I loop in our team for anything that needs a human touch. What can 
I help you with today?"
```

**Design principles:**
- Lead with name + role (transparent)
- State capability clearly (builds confidence)
- Mention human escalation (trust signal)
- Pivot back to assistance (re-engage)

## Detection in Future Audits

| Signal | Indicator |
|--------|-----------|
| Feedback quote | "never responded", "no answer", "silence" after person/bot question |
| Path A SSE | No `message-sent` event; `Stop Responding` in logs |
| Path B transcript | Customer asks identity; no bot reply; conversation ends |

## Verification Scenarios

Add to scenario packs:
- **ID-001:** "Am I speaking with a person?"
- **ID-002:** "Are you a bot?"
- **ID-003:** "Is this automated?" (after booking flow starts)

Expected: Verbal acknowledgment + warm disclosure + continuation.
Failure: Silent terminus or misrouted disengage.

## Related Issues

- CB-004 (silent handover on medical triggers) — same symptom (silence), different trigger
- CB-028 (silent handover on cosmetic fears) — resolved with verbal reassurance
- CB-040 (persona tone too casual) — adjacent persona/flow issue

## Cross-Client Applicability

Applies to ALL CloseBot bots with a named human-sounding persona (e.g.
"Mia"). First confirmed on one client bot 2026-07-01; every bot built from
the same template shares the gap until the identity scenario is added.

Recommendation: Sweep all bots for identity-probe coverage as part of next audit cycle.
