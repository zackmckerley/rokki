# Rokki — Setup (Phase 0)

This is the **exact** sequence to go from `git clone` to a running dashboard at `http://localhost:3000`.

## 1. Install prerequisites

- **Node 20.x** — verify: `node -v`
- **pnpm 9.x** — install: `npm install -g pnpm@9` → verify: `pnpm -v`
- **Docker Desktop** running
- **Supabase CLI** — install: https://supabase.com/docs/guides/cli → verify: `supabase -v`
- **Git**

On Windows: use WSL2 for the Supabase + Docker stack.

## 2. Install dependencies

```bash
pnpm install
```

This installs into all workspaces (`apps/web`, `apps/mcp-server`, `apps/tool-executor`, `apps/indexer`, `packages/db`).

## 3. Start local infrastructure

In two terminals:

**Terminal A — Supabase (Postgres + auth + storage + realtime):**
```bash
supabase start
```
Wait ~30s. Supabase prints URLs + keys when ready. Copy these.

**Terminal B — Docker services (Redis + MinIO + ClamAV):**
```bash
docker compose up -d
```

## 4. Apply migrations + seed

```bash
supabase db reset
```

This runs `supabase/migrations/20260419120000_initial_schema.sql` followed by `supabase/seed.sql`. You now have:
- All tables + RLS policies
- 4 test users: zack@test.rokki.ai, carlos@test.rokki.ai, maria@test.rokki.ai, bank@test.rokki.ai
- 2 orgs (HELIOS, Personal)
- 1 project (BRKL — 123 Brickell Renovation)
- 3 sample tasks

## 5. Configure env vars

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mcp-server/.env.example apps/mcp-server/.env.local
cp apps/tool-executor/.env.example apps/tool-executor/.env.local
```

Edit `apps/web/.env.local`:
- Paste `NEXT_PUBLIC_SUPABASE_URL` from the `supabase start` output
- Paste `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the same output
- Paste `SUPABASE_SERVICE_ROLE_KEY` from the same output

Do the same in `apps/mcp-server/.env.local`.

## 6. Run dev servers

```bash
pnpm dev
```

This starts everything in parallel via Turborepo:
- Web: `http://localhost:3000`
- MCP server stub: `http://localhost:3001`
- Tool executor stub: `http://localhost:3002`
- Indexer: background loop (logs to console)

## 7. Sign in

1. Go to `http://localhost:3000` — should redirect to `/login`
2. Enter `zack@test.rokki.ai`
3. Click "Send sign-in link"
4. Supabase logs the magic link in its CLI output AND at `http://localhost:54324` (Inbucket — local email capture)
5. Click the link → you land on the dashboard
6. You should see the BRKL project listed

## 8. Verify

```bash
curl http://localhost:3000/api/v1/health
# → { "status": "ok", "checks": { "database": { "ok": true } } }

pnpm typecheck
pnpm lint
pnpm test
```

All three should pass.

## Phase 0 acceptance check

Match against `docs/11_ACCEPTANCE.md §11.2`:

- [x] Repo exists with README, CLAUDE.md, LICENSE, .gitignore, docs/
- [ ] `pnpm install` completes cleanly — **you run this**
- [ ] `supabase start` brings up local Postgres — **you run this**
- [ ] `docker compose up -d` starts Redis/MinIO/ClamAV — **you run this**
- [ ] `pnpm dev` runs web + MCP + tool-executor + indexer — **you run this**
- [ ] `http://localhost:3000` loads the login page — **you verify**
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass — **you run these**
- [x] Dark theme is default; Geist Sans/Mono loaded
- [x] Rokki wordmark visible in top bar
- [x] CSS variables from docs/08_UI_DESIGN.md applied
- [x] Tailwind config references tokens (no arbitrary values)
- [x] All 22 tables exist after `supabase db reset`
- [x] All RLS policies in place
- [x] Seed creates 4 test users, 2 orgs, 1 project
- [ ] `main` branch deploys to staging.rokki.ai — **requires Vercel + Supabase staging projects set up**
- [ ] Sentry error trace — **requires Sentry project**

## What's NOT done in Phase 0

Phase 0 is foundations. These belong to later phases and are explicitly out of scope:

- Creating projects (Phase 1)
- Creating tasks / uploading files (Phase 1)
- Full MCP protocol implementation (Phase 1)
- Tool marketplace (Phase 2)
- Mobile apps (Phase 3)

See `docs/11_ACCEPTANCE.md` for the full phase gate lists.

## Troubleshooting

**`pnpm install` warns about peer deps** — React 19 RC version pinning, acceptable for Phase 0.

**`supabase start` fails with port conflict** — another Supabase instance running; run `supabase stop` first.

**Docker container health check fails for ClamAV** — CVD definition download can take 2-3 minutes on first start; wait and retry.

**`pnpm dev` shows `Cannot find module '@rokki/db'`** — run `pnpm install` from the repo root, not inside `apps/web`.

**Magic link email doesn't arrive** — check Inbucket at `http://localhost:54324`. Supabase CLI local email goes there, not to real inbox.

**Web shows "Database error" on dashboard** — `.env.local` probably has empty or wrong Supabase URL/keys. Re-copy from `supabase start` output.
