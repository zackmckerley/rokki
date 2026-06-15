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

## Deploy to Fly.io (Zack — the one new account)
```bash
# 1. one-time: install flyctl + log in
#    https://fly.io/docs/flyctl/install/
fly auth login

# 2. from apps/signal-bridge/
fly launch --no-deploy            # creates the app from fly.toml (keep the name)
fly volumes create signal_data --size 1 -r iad   # persistent signal-cli session

# 3. secrets
fly secrets set \
  BRIDGE_SECRET="$(openssl rand -hex 32)" \
  SUPABASE_URL="https://<prod-ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# 4. ship it
fly deploy

# 5. verify
curl https://rokki-signal-bridge.fly.dev/health
```

Then Rokki (Messages → Connect Signal) calls `/accounts/:userId/link`, shows the
QR, you scan it from **Signal app → Settings → Linked Devices**, and your
threads start syncing.

> Keep `BRIDGE_SECRET` and the service-role key in Fly secrets only — never in
> the repo. The `signal-cli` session lives on the mounted volume; treat that host
> as holding decrypted message plaintext (the inherent E2E-bridge tradeoff).

## Local dev
```bash
pnpm --filter @rokki/signal-bridge dev   # needs signal-cli on PATH + the env vars
```
