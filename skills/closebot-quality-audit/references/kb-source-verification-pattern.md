# KB Source Verification Pattern

Parallel cross-reference methodology for achieving 100% certainty on CloseBot knowledge base accuracy against Google Drive and Slack channels.

## When to Use

- Fleet-wide Ultra revamp audits (4+ bots)
- Pre-publish verification of critical facts
- Resolving conflicting information between sources
- Building a KB from scratch (empty-KB case)

## Method: 5-Agent Parallel Fan-Out

```
You (CEO) → 5 Verification Agents (one per client)
   ├─ Agent Alpha → Client A (Drive + Slack #client-a)
   ├─ Agent Bravo → Client B (Drive + Slack #client-b)
   ├─ Agent Charlie → Client C (Drive + Slack #client-c)
   ├─ Agent Delta → Client D (Drive + Slack #client-d)
   └─ Agent Echo → Client E (Drive + Slack #client-e)
```

**Delegate brief template:**
```
Goal: Verify [CLIENT] KB accuracy against Google Drive and Slack at 100% certainty

Check ALL sources:
- Marketing Drive > Clients > [Client] for ALL documents
- Slack #[client] (or your shared ads/ops channel) for ALL relevant messages
- Cross-reference findings against: [KB_FILE_PATH]

Verify these facts:
- [ ] Pricing (every number)
- [ ] Provider identity
- [ ] Location/hours
- [ ] Deposit policies
- [ ] Service limitations

Return detailed report with:
1. Source citations (message dates, doc names, line numbers)
2. Confidence level per fact (100% / ~85% / unverified)
3. Conflicts found with resolution
4. Gaps requiring client confirmation
```

## Verification Confidence Levels

| Level | Definition | Action |
|-------|------------|--------|
| **100%** | Owner explicitly stated in Slack or signed doc | Use as canonical |
| **~85%** | Agency pricing sheet or authored KB (not directly read) | Likely correct, flag for confirmation |
| **Unverified** | No source found | Mark as gap, do not fabricate |

## Critical Blockers to Flag

### UI Gates (OAuth-Only)
Every fresh CloseBot duplicate requires:
1. **Persona assignment** — `no_persona` = silent bot
2. **Source re-attachment** — wrong source = routes to wrong client

**Always check:**
```bash
# View agent output shows:
"sources": []  # ← BLOCKED, needs UI re-attach
"persona": null  # ← BLOCKED, needs UI assignment
```

### Empty KB Alert
```
"Smart-FAQs": 0
"library_files": 0
```
→ Bot has NO fallback. Either build KB or confirm defer-only design.

### Null Answer Alert
```json
{
  "question": "What are your hours?",
  "answer": null  # ← Bot will be silent
}
```

## RAG Format Compliance Checklist

When verifying or building KBs, ensure:

- [ ] Clear hierarchy with `##` headers (Practice → Offers → Booking → FAQ)
- [ ] Bullet-point retrievable chunks (not narrative paragraphs)
- [ ] "READ FIRST" priority section for critical facts (deposit truth)
- [ ] Explicit anti-hallucination rules ("NEVER say X", "always defer Y")
- [ ] FAQ Quick Reference with Q/A pairs
- [ ] Source-attributed facts where available
- [ ] No creative hooks masquerading as prices (e.g. an "<Offer Name> at $X" ad hook)

## Output Template

```markdown
## [CLIENT] KB Verification Report — [Date]

### Verified Facts (100% Certainty)
| Fact | KB Value | Source | Evidence |
|------|----------|--------|----------|
| Service A (offer) | $X | Owner, in writing (chat message) | "Ad special: Service A is $X" |

### Partially Verified (~85%)
| Fact | KB Value | Source | Gap |
|------|----------|--------|-----|
| Travel fee | $Y beyond N miles | Authored KB | No owner confirmation; presumed from pricing sheet |

### Unverified Gaps
- [ ] Business hours (no source found)
- [ ] Exact duration of a service (two sources disagree)

### Conflicts Resolved
- **Add-on pricing:** a Drive price was actually a different service's regular price; the real add-on price came from the owner's written confirmation
- **"<Offer Name> at $X":** Creative hook, NOT a menu price (owner confirmed in writing)

### Bot Config Defects Found
- CB-003: Injector name drift (Job-Info names one provider, nodes name another)
- CB-013: Deposit contradiction (Handle Pricing says "no deposit", nodes say "$X deposit")

### Files Created
- Your own verification report (keep it outside this repo — it holds client data)
```

## Common Verification Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Expired Drive OAuth | "401 Invalid Credentials" | Re-auth or rely on cached session intel files |
| Slack channel not found | Zero messages | Check your shared ads/ops channel as fallback |
| Owner says "we decided" | Ambiguous timing | Find explicit confirmation message |
| Old KB vs new offer | Conflicting prices | The owner's latest written confirmation takes precedence over Drive docs |
| Creative ad hooks | "<Offer Name> at $X" | Verify: hook vs actual menu price |
| Inherited template errors | Template's "$25 credit" offer leaked into a clone | Leak-assert after every duplicate |

## Related

- `closebot-audit-loop` — audit → fix → re-audit loop (use this verification pattern within)
- `closebot-apply-template/references/agent-architect.md` — building new agents with verified KBs
