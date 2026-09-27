
# Skill: CloseBot Agent Architect

Build CloseBot agents that quantifiably outperform existing configurations.

## Guiding Principle: Smaller Is Better

CloseBot's own guidance (https://docs.closebot.com) is to split instructions into short, titled sections rather than one large block of text.

Small, concise prompts have consistently produced better replies than long ones in our builds. Always optimize for brevity while preserving critical business information.

## Harness Framework: Small Agency, Not One Genius

A good audit/build setup uses a **small agency
of dumb-but-reliable agents** (Builder, QA, Librarian, Error Doctor) rather
than one genius agent. Each agent has: Prompt (job description), Context
(incremental loading — not all at once), Tools (clean API mappings to
scripts), Memory (3 buckets: short-term, long-term, reflection), Harness
(guardrails), and a Loop (plan→inspect→act→observe→verify→fix→document).

When building a bot, use the shipped tools:
- `bash scripts/cb-view-agent.sh <bot_id>` (or `cb bot audit <bot_id>`) to read the current flow before editing
- `cb kb verify --source <src> --bot <bot_id>` to check what's already in the KB
- `cb bot pull` / `cb bot push` (via `closebot-edit-job-flow`) for surgical edits
- `cb bot test <bot_id> "msg"` to sandbox-test before publishing
- `skill-retro` runs a background self-healing review after the work

## The Template Framework

Always clone your template bot (`$CB_TEMPLATE_BOT` — set it in `.env` or
`cb.config.json` → `templateBot`) as the starting skeleton:

```bash
source .env
NEW_BOT=$(curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$CB_TEMPLATE_BOT/duplicate" \
  -H "Content-Type: application/json" | jq -r '.id')
```

The recommended agent-node set provides:
- **General Info Collection** → discovery
- **Booking Readiness Agent** → qualification + deposit disclosure
- **Booking Agent** → calendar + confirmation
- **Deposit Confirmation Agent** → clear handoff
- **4x MultiObjective routes** (vs industry standard 1)

## Compression Targets

Measure against the bot being replaced:

| Metric | Target | Why |
|--------|--------|-----|
| Job Info chars | < 2,500 | Sent with EVERY message |
| Method sections | 2-3 per node | Action-oriented, minimal prohibitions |
| EnableThinking | `true` on all Method nodes | Quality boost |
| MultiObjectives | ≥ 4 | Smart routing (> pricing only) |
| Prompt/response | Plain text only | No symbols < > { } [ ] |

## 5-Step Build Process

### Step 1: Analyze Baseline
View the existing bot to understand weaknesses:

```bash
cd $CLOSEBOT_DIR
bash scripts/cb-view-agent.sh <existing_bot_id> --json | jq '.' > /tmp/baseline.json
```

Measure:
- Character count in Job Information
- Number of MultiObjectives
- `EnableThinking` values
- Section bloat (long contraindication lists, repetitive don'ts)

### Step 2: Clone Framework

```bash
cd $CLOSEBOT_DIR
source .env
NEW_BOT=$(curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/$CB_TEMPLATE_BOT/duplicate" \
  -H "Content-Type: application/json" | jq -r '.id')

# Pull steps
curl -s -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  "https://api.closebot.com/bot/${NEW_BOT}/steps?botVersion=0.0.1" > /tmp/steps.json
```

### Step 3: Compress & Optimize

Job Information structure (4 sections max):
```json
"overallPromptSections": [
  {"Title": "Why we're here", "Body": "One line context"},
  {"Title": "Who we are", "Body": "Business + provider identity"},
  {"Title": "How we talk", "Body": "Tone + routing rules"},
  {"Title": "Guardrails", "Body": "Deposit rules + compliance + prohibited words"}
]
```

**OFFER-AGNOSTIC DESIGN (CRITICAL):** NO offer-specific pricing, ad copy,
or offer names belong in Job Information, Method node sections, or
MultiObjective instructions. All offer facts live in the KB (Smart FAQs +
library files). The MultiObjective "Handle Pricing" must say "use the
knowledge base to answer pricing questions" — NOT "service X is $299."
This allows one agent structure to handle any offer without agent edits
(just update the KB). A good template bot is usually one that is nearly
perfect already and just needs its pricing moved from agent → KB.

Method sections (2-3 max):
- **Discover** - what to learn from customer
- **Tone** - how to communicate
- **Guardrails** - minimal prohibitions (if needed)

Enable on ALL Method nodes:
- `EnableThinking: true`
- `EnableSmartFaq: true`
- `EnableLibraryContext: true`
- `EnableCheckAvailability: true`
- `EnableGhlBooking: true`
- `EnableModifyAppointment: true`

### Step 4: MultiObjective Routing

Replace single "Handle Pricing" with 4 objectives:

```json
"Objectives": [
  {
    "Title": "Handle Pricing",
    "Instructions": "Answer directly using facts from the knowledge base. State price. Pivot to booking."
  },
  {
    "Title": "Handle Financing",
    "Instructions": "Use KB for financing options (Cherry/Afterpay). Soft check. Interest-free options."
  },
  {
    "Title": "Handle Drug Questions",
    "Instructions": "DO NOT name semaglutide/Ozempic/etc. Route to provider."
  },
  {
    "Title": "Handle Safety",
    "Instructions": "Route medical/side-effect/FDA questions to provider."
  }
]
```

**Key change:** Pricing instructions say "use the knowledge base" not
hardcoded prices. The agent never stores pricing — it looks it up from
the KB at runtime.

### Step 5: Measure & Save

Calculate compression:

```python
# Count baseline_chars vs new_chars
compression = new_chars / baseline_chars
target = 0.25  # 75% reduction
```

Save visually to API:

```bash
jq '{botSteps: .}' /tmp/steps.json | curl -s -X POST \
  -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  "https://api.closebot.com/bot/${NEW_BOT}/save"
# Expect: {"invalidPaths": []}
```

## Tools Configuration

```bash
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {"type":"SmartFAQ","enabled":true,"options":{}},
    {"type":"SummarizeConversation","enabled":true,"options":{}}
  ]' \
  "https://api.closebot.com/bot/${NEW_BOT}/saveTools"
```

## Source Attachment

```bash
curl -s -X POST -H "X-CB-KEY: $CLOSEBOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tags":["ai_setter_testing"],"channels":["Live_Chat"],"enabled":true}' \
  "https://api.closebot.com/bot/${NEW_BOT}/source/${SOURCE_ID}"
```

## UI Gates (Cannot Automate)

CloseBot requires these in the web UI:
- **Persona assignment** — attach your standard persona
- **Source re-attachment verification** — confirm in UI even if API attach succeeded

Document these in the build summary for the user.

## Performance Comparison Template

```markdown
| Metric | Baseline | Evolution | Improvement |
|--------|----------|-----------|-------------|
| Prompt Size | 8,000 chars | 1,745 chars | 78% smaller |
| Job Info Sections | 2 dense | 4 focused | Clearer |
| Thinking Mode | false | true | Better reasoning |
| MultiObjectives | 1 | 4 | 4x routing |
| Library Context | Partial | 100% | No gaps |
```

## References

- `references/closebot-docs-best-practices.md` — Core documentation excerpts

## CRITICAL: API Save vs UI Rendering

The CloseBot `/save` endpoint accepts JSON and returns `{"invalidPaths": []}`, but **this does NOT guarantee the bot will open in the UI**.

### The Problem

The UI uses React Flow to render the visual node editor. The API's `/save` endpoint validates JSON schema but does NOT validate UI-rendering compatibility. A bot saved via API may:
- Return `200 OK` with empty `invalidPaths`
- Exist in the database with correct configuration
- **Fail to load in the UI** (perpetual loading spinner)

### Root Cause

The working bot structure from `GET /bot/{id}/steps` has this shape:
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

NOT wrapped in `botSteps`. The `/save` endpoint schema is underdocumented and accepts multiple formats, but only specific internal structures render in the UI.

### The Fix

**Prefer UI-based editing for existing bots.** The API `/save` should only be used for:
1. Initial bot creation via `/duplicate` (which creates UI-compatible structure)
2. Tool configuration via `/saveTools` (works reliably)
3. Metadata updates via `PUT /bot/{id}` (name, category, etc.)

For prompt/content changes on existing bots:
1. Export current config via `GET /bot/{id}/export` (returns KDL)
2. Edit in CloseBot UI directly
3. OR delete and re-clone if structure needs changes

### Export vs Save Format Mismatch

- **Export** (`/export`): Returns **KDL** (KDL Configuration Language)
- **Save** (`/save`): Expects **JSON** with specific React Flow structure
- **No conversion path**: You cannot feed KDL export directly into JSON save

### Verified Working Approach

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

# 4. Edit PROMPTS in UI, not via /save API
```

## Common Pitfalls

1. **Don't hardcode offer pricing in the agent** — all pricing belongs in the KB (Smart FAQs + library files). Job Info, Method sections, and MultiObjective must say "use the knowledge base" not quote prices. This is the offer-agnostic principle.
2. **Don't hand-craft node positions** — clone framework, mutate contents in UI
3. **Don't skip Thinking Mode** — it's free quality
4. **Don't use >4 sections** — breaks the "smaller is better" rule
5. **Don't duplicate prohibited words** — "Never say X" rewards the model with attention on X
6. **Don't trust `invalidPaths: []`** — it means schema-valid, not UI-renderable
7. **Don't try to convert KDL export to JSON save** — formats are incompatible
8. **Don't forget the exits** — Method nodes MUST have `ExitPaths` in their data AND @@@ mentions in instructions telling the agent when to use each exit. Without exits, the agent doesn't know how to proceed between nodes. The flow is: `ExitPaths` array defines available exits → @@@ mentions in sections tell the agent when to use them → edges connect the exit to the next node. Missing any piece breaks the flow.