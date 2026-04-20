# Rokki

Project management platform with a Bloomberg-inspired terminal aesthetic and AI-native design.

**Domain:** [rokki.ai](https://rokki.ai)

## Documentation

- [BUILD_SPEC.md](./BUILD_SPEC.md) — vision, design, phase plan
- [CLAUDE.md](./CLAUDE.md) — orientation for Claude Code
- [docs/](./docs/) — detailed implementation specs (data model, API, MCP, files, tools, UI, security, testing, acceptance criteria)

## Stack

- Next.js 15 App Router · React 19 · TypeScript strict
- Supabase (Postgres + auth + RLS + realtime)
- Azure Blob Storage · Cloudflare CDN
- Tailwind · shadcn/ui · Radix
- Vercel (web) · Azure Container Apps (MCP, tool executor)

## Prerequisites

- Node 20.x (`nvm use 20`)
- pnpm 9.x (`npm install -g pnpm`)
- Docker Desktop
- Supabase CLI (`brew install supabase/tap/supabase` or see [docs](https://supabase.com/docs/guides/cli))

## First-time setup

```bash
git clone https://github.com/rokki-ai/rokki.git
cd rokki
pnpm install

# start local infra
supabase start              # postgres, auth, storage
docker compose up -d        # redis, minio, clamav

# apply migrations + seed
supabase db reset

# copy env templates
cp apps/web/.env.example apps/web/.env.local
cp apps/mcp-server/.env.example apps/mcp-server/.env.local
cp apps/tool-executor/.env.example apps/tool-executor/.env.local
# fill in the Supabase URL + keys printed by `supabase start`

# start dev servers
pnpm dev
```

Open `http://localhost:3000`.

## Apps & services (ports)

| Service | Port | URL |
|---|---|---|
| Web (Next.js) | 3000 | `http://localhost:3000` |
| MCP server | 3001 | `http://localhost:3001/v1/sse` |
| Tool executor | 3002 | internal |
| Indexer | — | background worker |
| Supabase Studio | 54323 | `http://localhost:54323` |
| MinIO console | 9001 | `http://localhost:9001` |

## Commands

```bash
pnpm dev           # start all apps in parallel
pnpm build         # production build across workspace
pnpm typecheck     # tsc --noEmit across workspace
pnpm lint          # eslint
pnpm test          # vitest unit + integration
pnpm test:e2e      # playwright
```

## Deploy

- `main` → staging via GitHub Actions (auto)
- Production deploy requires manual approval (see `.github/workflows/deploy-prod.yml`)

See [docs/09_ENVIRONMENTS.md](./docs/09_ENVIRONMENTS.md) for details.

## License

UNLICENSED. See [LICENSE](./LICENSE).
