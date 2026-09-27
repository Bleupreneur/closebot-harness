# Notes on building CloseBot agents

Our own working guidance, learned from building and auditing bots. For the
official feature documentation, read CloseBot's docs at
https://docs.closebot.com (and the developer docs at
https://developers.closebot.com). Where this file and the official docs
disagree, trust the official docs and the live API.

## Break Method instructions into sections

A Method (agent) node reads more reliably when its instructions are split
into several short, titled sections (for example Discover, Tone, Guardrails)
than when they are one long paragraph. Aim for 2-6 short sections per node.

## @-mention prefixes

| Prefix | Refers to | Example |
|--------|-----------|---------|
| `@` | Variables | `@contactName` |
| `@@` | Tools | `@@BookAppointment` |
| `@@@` | Exits | `@@@ExitToBooking` |
| `@@@@` | Follow-up cadences | `@@@@WarmFollowUp` |

Naming the tool or exit explicitly in the instructions makes the agent use it
more reliably than hoping it infers when to.

## Keep Job Information short

Job Information goes out with every message the agent sends, while the
knowledge library is only consulted when a question needs it. Every extra
line of Job Information costs you on every turn, so keep it to identity,
tone and hard rules, and move facts (prices, service details) into the KB.

## Smart FAQ

Smart FAQ collects questions the agent couldn't answer into draft entries
for the owner to fill in, per source (each client has its own FAQs). Turn it
on for every conversational Method node.

## Thinking mode

Turning on thinking (`EnableThinking: true`) lets the agent reason before it
replies and noticeably improves reply quality. Leave it on unless cost is a
real constraint.

## Restrict tools per stage

Give each node only the tools its stage needs. A qualification node needs
read-style tools (Smart FAQ, Update Contact); a booking node needs the
calendar tools (Check Availability, GHL Booking).

## Follow-up cadences

A job flow can carry several follow-up cadences; the agent switches between
them with an `@@@@` mention, and a cadence resets when the lead replies. See
the official docs for current limits and scheduling behaviour.

## Knowledge library input types

| Input | Reliability in our experience | Notes |
|-------|-------------------------------|-------|
| Plain text | Best | Nothing to mis-parse |
| Document upload | Good | Can carry formatting noise |
| Web scrape | Fair | Picks up headers, footers and page chrome |

Put critical pricing and offer details in as plain text.

## Library files vs Smart FAQ

- **Library files** hold general business knowledge (pricing, services, policies).
- **Smart FAQ** holds specific question/answer pairs.
- `EnableLibraryContext` gives a Method node access to library files.
- `EnableSmartFaq` gives it access to FAQ items.

`EnableSmartFaq=true` does NOT grant library-file access. Turn on both for
full KB coverage.

## Built-in CRM tools

CloseBot ships built-in tools per CRM (for GHL: Book Appointment, Check
Availability, Update Contact, Add Tag, Modify Appointment). Enable only what
each node actually needs.

## Recommended scenario set

For healthcare and aesthetics bots:
- **Aggression** (high priority, e.g. 90) → human handover
- **Pricing Inquiry** (e.g. priority 55) → pricing MultiObjective
- **Human Handover Needed** → medical conditions, pregnancy, prescription-drug questions
- **not_interested** → graceful exit
- **ai_booking_error** → technical-failure escalation

## Guardrails that work

Short, specific rules the model can follow:
- "Never name specific prescription drugs by brand."
- "Never guarantee results."
- "Never agree to a discount."
- "Route medical questions to the clinical team."
- "Output the client-facing reply only. Plain text. No symbols like < > { } [ ]."

Avoid repeating the same prohibition many times: repeating a banned word can
make the model more likely to say it.
