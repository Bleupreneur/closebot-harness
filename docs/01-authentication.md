# Authentication

CloseBot uses a single header-based API key for both API surfaces.

## Header

```
X-CB-KEY: <your_api_key>
```

POST / PUT / PATCH requests must also send:

```
Content-Type: application/json
```

## Generating a key

1. Sign in at `https://app.closebot.com`.
2. Open `https://app.closebot.com/settings?tab=keys`.
3. Click the **+** button at the top of the keys table.
4. Name the key in the modal.
5. Copy the key immediately — **it is only displayed once and cannot be re-fetched**.

Keys are scoped to the **user**, not the agency. Team members each generate their own keys; owners do not get blanket access to other users' endpoints.

## Storage rules (agent-enforced)

- **Never** commit the key to source control.
- **Never** hardcode the key in scripts or configs.
- Read it from the environment: `$CLOSEBOT_API_KEY`.
- Put it in the repo-root `.env` (copied from `.env.example`, gitignored), in `~/.config/closebot/.env` (plugin installs), or export `CLOSEBOT_API_KEY` in your shell. `cb init` creates the repo `.env` (`cb init --global`: the user-level one, dir mode 700) from `.env.example` with mode 600 and never overwrites an existing file; paste the key after `CLOSEBOT_API_KEY=`.
- `cb` looks in exactly three places, in this order: the `CLOSEBOT_API_KEY` environment variable, then `<repo>/.env`, then `~/.config/closebot/.env` (`$CLOSEBOT_CONFIG_DIR/.env` if set). Nothing else is read — never the current project's `./.env`.
- `cb doctor` confirms the key is found and valid (`GET /agency/current`) and that every `.env` it reads is mode 600. It prints which file the key came from and its length, never the key.

## Listing / revoking keys via the API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/account/apiKey` | List keys belonging to the authenticated user |
| `POST` | `/account/apiKey` | Create a new key |
| `DELETE` | `/account/apiKey/{keyId}` | Revoke a key |

See [`docs/endpoints/account.md`](./endpoints/account.md).

## Live Message API auth quirk

The live message endpoint (`POST https://api.closebot.ai/message`) accepts `X-CB-KEY` in the header **or** `api_key` in the JSON body. **Auth is optional** when the contact's `id` resolves to a lead inside an integrated GoHighLevel CRM source — CloseBot trusts the GHL integration in that case. For all other invocations, supply the key.

## What the key does NOT cover

OAuth-based source connections (e.g., creating a brand-new GHL CRM integration) **cannot** be initiated via the API — they require the user to walk through the OAuth handshake in the CloseBot UI. The API can read and update **existing** sources only. See `[INCOMPLETE]` in [`03-rate-limits.md`](./03-rate-limits.md) for unspecified flow details.

## Quick test

```bash
curl -i -H "X-CB-KEY: $CLOSEBOT_API_KEY" https://api.closebot.com/account/apiKey
# Expect 200 with a JSON array of keys (excluding the secret values).
```
