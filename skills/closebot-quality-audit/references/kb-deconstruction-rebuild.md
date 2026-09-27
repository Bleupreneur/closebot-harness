# KB Deconstruction & Rebuild Methodology

How to fully audit, tear down, and rebuild a CloseBot Knowledge Base from
scratch. Based on a live client rebuild (2026-07-06) and research against
CloseBot's own KB guidance.

## When to Use This

- Bot quotes wrong prices despite KB having correct prices
- KB has null-answer FAQs, duplicates, or wrong amounts
- Library file is unstructured garbage (empty lines, duplicated FAQ dumps)
- Offer pricing (ad campaigns) contradicts standard pricing in the KB
- Full offer-agnostic rebuild needed (move all pricing from agent flow to KB)

## Root Cause: MultiObjective Overrides KB

**This is the #1 reason a bot quotes wrong prices after a KB fix.**

The MultiObjective "Handle Pricing" node instructions sit in the system prompt.
The LLM prioritizes system prompt instructions over KB (RAG) retrieval. If the
MultiObjective says "Service A is $20/unit" and the KB Smart FAQ says "$10/unit
(offer)", the bot quotes $20 — every time, even after the KB is fixed.

**Fix sequence (both required):**
1. Fix the KB (Smart FAQs + library file) — live on re-index, no publish needed
2. Strip ALL specific pricing from the MultiObjective instructions — saves as
   draft, requires publish via closebot-publish-safely

You must do BOTH. Fixing only the KB is insufficient. Fixing only the
MultiObjective leaves the KB with wrong data. The KB is the source of truth;
the MultiObjective just tells the bot where to find it.

## KB Best Practices (summarized from CloseBot's guidance)

Researched 2026-07-06. Re-check against CloseBot's current docs (see the docs MCP
server / help center linked from the README) before relying on the numbers.

### Library File Format
- Plain text (.txt) is the most reliable format — "what you see is what you get"
- The retrieval system is **title-blind** — the bot only reads text content, not
  file names. Never reference file names in prompt instructions.
- Structure with clear paragraphs, line breaks, and bulleted/numbered lists
- "More isn't always better" — irrelevant info decreases retrieval accuracy
- 6MB hard limit per document

### Smart FAQ Best Practices
- Good: precise, recurring, direct consumer questions (e.g., "Do you offer
  parking validation?"). Answer should be concise, direct, factual.
- Bad: conversational filler, irrelevant questions, or null answers
- Smart FAQs are checked during every conversational action EXCEPT booking
- Delete unresolved/dumb FAQs — don't save answers to useless questions

### Offer vs Standard Pricing (CRITICAL)
- Standard pricing and promotional pricing must NEVER live in the same KB
  document or in global Job Information — mixing causes "price leakage"
- Standard pricing belongs in the library file (the "menu")
- Promotional/offer pricing belongs in Smart FAQs AND the library file, clearly
  marked as the current offer that overrides standard pricing
- Pricing must NEVER live in the global Job Information or persona prompt
- For single-source bots (most common): put offer pricing in both Smart FAQs
  (for precise Q&A) and the library file (for general retrieval), with an
  explicit statement: "Offer pricing overrides standard pricing"
- The bot should quote the offer price when a lead comes from an ad

## Rebuild Procedure

### Step 1: Read the current KB

```bash
# Smart FAQs (Q&A pairs) — filter to the client's source client-side
cb smartfaq get-smart-faq --json

# Library files: list, then read each file's content
cb library get-files-2 --json
cb library get-view --fileId <file_id>

# Or check a manifest-built KB end to end
cb kb verify --source <src_id> --json
```
Run `cb help smartfaq` / `cb help library` for exact flags.

### Step 2: Read the agent flow (to find hardcoded pricing)

```bash
cb bot pull <bot_id> --out steps.json
# MultiObjective instructions (look for hardcoded prices)
jq '.nodes[] | select(.type=="MultiObjective") | .data.Objectives[] | {Title, Instructions}' steps.json
# Method nodes
jq '.nodes[] | select(.type=="Method") | {title: .data.Title, instructions: .data.Instructions, sections: .data.Sections}' steps.json
```

### Step 3: Read the client truth

The running ad copy IS the offer truth. Collect the current ads and the
owner's written price list (wherever you keep client notes) before editing.

### Step 4: Check CloseBot's docs for KB mechanics

Ask the CloseBot docs (docs MCP server or help center): How should Smart FAQs
be written? What makes a good vs bad Smart FAQ? How should library files be
structured?

### Step 5: Deconstruct — identify what to delete/fix/add

For each Smart FAQ, categorize as:
- **KEEP** — correct, accurate, useful
- **DELETE** — null answer, duplicate, wrong info, irrelevant
- **FIX** — right question, wrong/outdated answer
- **ADD** — missing question that a lead would ask

Common deletion targets:
- `answer: null` FAQs (bot sees the question but has no answer)
- Duplicate FAQs (same question asked 2+ different ways)
- FAQs with wrong amounts (e.g., a $25 deposit when the policy says $X)

Common fix targets:
- Standard pricing that should be offer pricing
- Missing offer details (deposit amount, cap, first-visit qualifier)
- Missing program pricing (e.g., Program 1/2/3 at $1,000/$2,000/$3,000)

### Step 6: Execute KB changes

```bash
# Delete bad FAQs (Tier 2 — permanent)
cb smartfaq delete-smart-faq --id <faq_id>

# Fix existing FAQs: Smart FAQs have NO update (PUT) — delete, then re-add
cb smartfaq post-smart-faq --body '{...}'   # see cb help smartfaq / docs/endpoints

# Add missing FAQs
cb smartfaq post-smart-faq --body '{...}'
```
Verify with `cb smartfaq get-smart-faq --json` — a 2xx proves nothing on its own.

### Step 7: Rebuild the library file

Write a clean, structured .md or .txt file with:

```
Business Name — Knowledge Base

Business Identity
- Name, owner, location, website, hours

About [Provider]
- Credentials, oversight, care philosophy

Active Offers (Ad Campaigns)
These are promotional offers. Offer pricing overrides standard pricing.

Offer 1: [Name]
- Price, deposit, what's included, financing, longevity, contraindications

Offer 2: [Name]
- Price, deposit, products, caps, answer-on-ask rules

Offer 3: [Name]
- Price, deposit, what's free, program tiers, compliance rules

Standard Service Menu (non-offer services)
- All other services with standard pricing

Deposit Policy
- Amount, non-refundable, goes toward service, team confirms

Financing
- Financing providers you actually offer

Insurance
- Whether accepted, alternatives

Compliance Rules
- Never quote internal pricing, never discount, never guarantee results,
  never give medical advice, never claim FDA approval
```

```bash
# Replace the library file content (live on re-index, no publish needed).
# Manifest-driven: edit the file in your KB folder, then
cb kb update --from <kb_dir>
# or the raw op: cb library put-files --fileId <file_id> ...   (cb help library)

# Verify
cb library get-view --fileId <file_id>
```
If answers stay stale after a PUT-replace, see
`closebot-attach-knowledge/references/kb-stale-vector-purge.md` (delete + fresh upload).

### Step 8: Fix the MultiObjective (REQUIRED — see root cause above)

Edit the "Handle Pricing" objective in `steps.json` (via `closebot-edit-job-flow`),
then `cb bot push <bot_id> steps.json`. Example instructions text:

```text
The lead is asking about pricing. Answer directly, briefly, and warmly. This is only to handle pricing questions and nothing more.

Look up all pricing from the Knowledge Base using Smart FAQs and library context. Do not quote prices from memory — always retrieve from the KB.

Key rules:
- Every appointment requires a $X deposit that goes toward the service.
- Custom-quote services: do not quote — confirmed on the confirmation call.
- Secondary services: answer-on-ask only, never proactively pitch.
- Prescription programs: do not quote pricing or discuss the medication.

When a lead comes from an ad, the offer price in the KB is the price to quote. Offer pricing overrides standard pricing.

After giving any price, pivot to booking: ask if they would like to check availability.

Never quote internal or staff-only pricing. Never agree to a discount or imply one is possible. Never guarantee results and never give medical advice. Never claim any compounded medication or hormone is FDA approved.

Output must be plain text only. No symbols like < > { } [ ]. No formatting.
```

### Step 9: Verify the diff

```bash
# Keep the untouched pull as orig.json. Should show ONLY the MultiObjective
# Instructions changed — no pricing in the diff
diff <(jq -S . orig.json) <(jq -S . steps.json)
```

### Step 10: Publish (Tier 2 — requires explicit confirmation)

KB edits are live. But the MultiObjective is a flow edit — must publish:

```bash
# Use closebot-publish-safely skill (Tier 2 gate)
# Requires explicit "PUBLISH" confirmation in the same turn
```

### Step 11: Retest

Run the same scenarios that failed before. The bot should now:
- Retrieve offer pricing from the KB (not stale standard pricing from the prompt)
- Quote the correct offer price
- Handle all offers consistently

## Case Study: Client Med Spa (2026-07-06)

### Problem
- Bot quoted $20/unit for Service A when the ad said $10/unit
- Bot said it had no pricing to share for a multi-tier program
- Library file was 80+ blank lines with duplicated FAQ dumps
- 3 null-answer FAQs, 3 duplicate FAQs, 1 FAQ with the wrong deposit amount
- MultiObjective had ALL pricing hardcoded (Service A, Service B, etc.)

### Root Cause
MultiObjective instructions in the system prompt overrode the KB. Even after
fixing the KB Smart FAQs to say $10/unit, the bot still quoted $20/unit because
the MultiObjective (in the system prompt) said $20/unit.

### Fix Applied
1. Deleted 6 bad FAQs (null answers, duplicates, wrong deposit amount)
2. Fixed 4 FAQs (Service A offer price, program pricing, a custom-quote service)
3. Added 2 new FAQs (program cost, Service A offer specifics)
4. Rebuilt library file as clean structured document with sections:
   - Business Identity, About the Provider, Active Offers (3), Standard Menu,
     Deposit Policy, Financing, Insurance, Compliance Rules
5. Rewrote MultiObjective "Handle Pricing" to redirect to KB (no hardcoded
   pricing), added "offer pricing overrides standard pricing" rule
6. Saved as draft v0.0.43 (NOT YET PUBLISHED at time of writing)

### Result
- KB is correct (verified by re-reading FAQs and library file content)
- Library file is clean and structured
- MultiObjective no longer hardcodes pricing
- Retest showed the primary offer PASS (correct offer price, financing, longevity, deposit)
- Service A and the program still failed because the draft wasn't published yet — the
  live bot still had the old MultiObjective with $20/unit hardcoded
- Publishing v0.0.43 will make the fix go live

### Key Lesson
Always check BOTH the KB AND the MultiObjective when a bot quotes wrong prices.
The MultiObjective in the system prompt wins over the KB. Fixing one without
the other is a no-op.
