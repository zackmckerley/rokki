# @rokki/signal-bridge

Always-on service that bridges a user's **Signal** account into Rokki, via
[`signal-cli`](https://github.com/AsamK/signal-cli). It links as a **secondary
device** (like Signal Desktop), receives messages into Supabase
(`signal_threads` / `signal_messages`), and sends on the user's behalf.

> Messaging only. Signal **calls (audio/video) cannot be bridged** — there's no
> API. See `docs/SIGNAL_INTEGRATION.md`. A/V/meetings are a separate
> Rokki-native (LiveKit) track.

This is the **Phase-0 skeleton**: structure + auth + DB writes are real; the
exact `signal-cli` JSON envelope mapping (`toInbound`) gets validated against a
live install during deploy.

## Endpoints
- `GET  /health` — liveness.
- `POST /accounts/:userId/link` → `{ uri }` — start linking; render `uri` as a QR.
- `POST /accounts/:userId/send` `{ signalNumber, signalId, kind, text }`.

All non-health routes require header `x-bridge-secret: $BRIDGE_SECRET`.

## Env
| var | what |
|---|---|
| `BRIDGE_SECRET` | shared secret Rokki sends to authenticate to the bridge |
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service role (bridge bypasses RLS to write on a user's behalf) |
| `PORT` | default 8080 |
| `SIGNAL_CLI_PATH` | default `signal-cli` |

## Deploy

Deploys run through **GitHub Actions** (`.github/workflows/deploy-signal-bridge.yml`)
on every change to `apps/signal-bridge/**`, or manually via
`gh workflow run deploy-signal-bridge.yml`. The build happens on **Fly's remote
builders** — no Docker needed.

### One-time bootstrap (from your machine, run once)
Install + log in to flyctl → https://fly.io/docs/flyctl/install/ , then:
```bash
fly apps create rokki-signal-bridge
fly volumes create signal_data --size 1 -r iad -a rokki-signal-bridge   # persists the signal-cli session
fly secrets set -a rokki-signal-bridge \
  BRIDGE_SECRET="$(openssl rand -hex 32)" \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
fly tokens create deploy -a rokki-signal-bridge   # → copy this, add to GitHub as FLY_API_TOKEN
```
Add the deploy token as the repo secret **`FLY_API_TOKEN`** (GitHub → Settings →
Secrets and variables → Actions). Then trigger the first deploy:
`gh workflow run deploy-signal-bridge.yml`. Verify:
```bash
curl https://rokki-signal-bridge.fly.dev/health   # {"ok":true,...}
```

> Keep `BRIDGE_SECRET`, the service-role key, and the Fly token in their secret
> stores only — never in the repo. The `signal-cli` session lives on the mounted
> volume; treat that host as holding decrypted message plaintext (the inherent
> E2E-bridge tradeoff).

## Local dev
```bash
pnpm --filter @rokki/signal-bridge dev   # needs signal-cli on PATH + the env vars
```
