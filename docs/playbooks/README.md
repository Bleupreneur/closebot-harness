# Playbooks

Common CloseBot tasks, each as a numbered sequence of API calls. Drop into any agent — copy the curl, swap variables, run.

Prefer `cb` (see `cli/README.md`) — these curl recipes remain as the reference for what each command does.

| # | Playbook | Tier |
|---|---|---|
| 1 | [Verify the package + key work](./01-smoke-test.md) | 0 |
| 2 | [List bots and inspect one](./02-list-bots.md) | 0 |
| 3 | [Create a bot, train it, and publish](./03-create-train-publish.md) | 2 (publish) |
| 4 | [Send a live message into a conversation](./04-send-live-message.md) | 1 |
| 5 | [Take a lead off auto-AI (human takeover)](./05-lead-ai-off.md) | 1 |
| 6 | [Attach a knowledge file to a bot](./06-attach-knowledge.md) | 1 |
| 7 | [Test a bot in a sandbox session](./07-test-session.md) | 1 |
| 8 | [Refill agency credits](./08-refill-credits.md) | 2 |
| 9 | [Pull message + booking metrics](./09-pull-metrics.md) | 0 |
| 10 | [Configure a Custom Webhook node](./10-custom-webhook-node.md) | 1 |
| 11 | [Upload, edit, and remove KB content (FAQs / Files / Webscrapes)](./11-upload-kb.md) ⭐ verified live | 1 |
| 12 | [Onboard a new client (duplicate base bot + customize)](./12-onboard-new-client.md) ⭐ core delivery flow | 1–2 |

Tiers per [`../SAFETY.md`](../SAFETY.md). Always run Tier 0 freely; state intent for Tier 1; require explicit confirmation for Tier 2.

**For new client work, start with playbook 12.** It chains duplicate → customize (7 dials) → KB upload → test → publish into one sequence with a paste-ready customization checklist.
