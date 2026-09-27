# Job Flow Actions — quick agent reference

Job Flows are CloseBot's drag-and-drop bot graph. Nodes are typed actions. The official per-node documentation is CloseBot's own, at <https://docs.closebot.com>; machine-readable node fields are in [`../schema/node-descriptors.json`](../schema/node-descriptors.json) (from `GET /bot/nodeDescriptors`). This file is a fast lookup for agents needing to **reason about** a flow without reading all of the official docs.

## Node types (35 documented)

### Tools
| Node | Purpose |
|---|---|
| Custom Tools | Define a callable tool that the agent invokes mid-flow |
| Email Tool | Send an email from within a flow |
| Smart FAQ | Answer from a curated FAQ corpus |

### Action / control flow
| Node | Purpose |
|---|---|
| Agent Node 🤖 | Hand off to an LLM agent for free-form response |
| Conversation | Multi-turn conversational segment |
| Objective | Goal the bot must achieve (e.g., "collect email") — modular replacement for monolithic prompts |
| Statement | Bot speaks a fixed line |
| True/False | Branch on a boolean condition |
| Switch | Multi-way branch |
| Delay (time) | Pause for a fixed duration |
| Delay (variable) | Pause for a value pulled from a flow variable |
| Custom Scenario | User-defined branching scenario |
| Aggression Detected | Branch when the contact becomes aggressive |
| Bot Detected | Branch when the inbound is identified as another bot |
| Stop Responding | Halt the conversation |

### External integrations
| Node | Purpose |
|---|---|
| Booking | Insert a calendar booking step |
| Custom Webhook | Outbound HTTP call to a user-supplied URL — see [`05-webhooks.md`](./05-webhooks.md) |
| Other Actions | Catch-all action set |
| Check Distance | Measure geographic distance |
| Get Property Details | Fetch property details (real-estate vertical) |
| Generate Street View | Render a Google Street View image |
| Set Field | Write a value to a CRM custom field |
| Modify Tags (GHL/LC) | Add/remove tags on the contact in GHL or LeadConnector |

### Settings (flow-level, not per-node)
- Action Operators
- Prohibited Words
- Why the Conversation is Happening
- Important Business Information
- Set Up Job Flow Variables
- Follow-ups
- Keyboard Shortcuts
- Chat Summary
- Chat Transcript

### Featured resources
- Pro Templates Library
- Client Testing Portal

## Programmatic access

Job Flows are read/written through `POST /bot/{id}/save` and inspected via `GET /bot/{id}/steps` and `GET /bot/nodeDescriptors`. See [`endpoints/bot.md`](./endpoints/bot.md). The full graph schema is `BotDto` in [`../schema/openapi.json`](../schema/openapi.json) — inspect via `jq '.components.schemas.BotDto' schema/openapi.json`.

## When you need detail

This file is the index. For node-level config fields (input names, types, defaults, constraints), read [`../schema/node-descriptors.json`](../schema/node-descriptors.json) (refresh with `GET /bot/nodeDescriptors`) and CloseBot's docs at <https://docs.closebot.com>.
