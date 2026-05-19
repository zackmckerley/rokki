# 09 — Environments & Deployment

**Scope:** Local dev setup, staging, production, environment variables, CI/CD, backups, and deploy targets.

## 9.1 Environments

| Env | URL | Purpose | Data |
|---|---|---|---|
| local | `http://localhost:3000` | Developer machine | Local Postgres (via Supabase CLI) |
| **sandbox** | `https://staging.rokki.ai` | Mirror of prod for safe experimentation | Supabase project `rokki-staging` (`hqsdhwlokfwcitfitees`) — periodically reloaded from prod |
| production | `https://rokki.ai` | Live users | Supabase project `rokki-production` (`bwtmtpcgilvrkhougjdo`) |

**Sandbox model:** the sandbox holds a **copy of prod data** so real users
can sign in with their existing credentials and see their actual workspace.
**Writes on sandbox stay on sandbox** — nothing syncs back to prod. The
mirror runs fortnightly via cron + on-demand via
`.github/workflows/refresh-sandbox.yml`.

(The Supabase project is still internally named `rokki-staging` and the
URL is still `staging.rokki.ai`; the user-facing concept is "sandbox.")

### 9.1.1 Vercel branch model (Plan A — sandbox-first promotion)

The Vercel `rokki-web` project is configured so:

- `main` branch → **sandbox deployment** at `staging.rokki.ai`. Every push to
  `main` auto-deploys via Vercel + `.github/workflows/deploy-staging.yml`
  applies any new SQL migrations to the sandbox Supabase project.
- `production` branch → **production deployment** at `rokki.ai`. The branch
  only moves forward when triggered by
  `.github/workflows/deploy-prod.yml`, which is a manual `workflow_dispatch`
  with required reviewer (the owner). The workflow:
  1. Confirms the `confirm=yes` input.
  2. Applies migrations to the production Supabase project.
  3. Fast-forwards `production` to `main` HEAD, triggering Vercel's prod build.
  4. Smoke-tests `https://rokki.ai`.
- Every PR → standard Vercel preview URL, also pointing at the sandbox
  Supabase (via the `preview` env-var scope) so previews never touch prod
  data.

### 9.1.2 Sandbox data refresh

The sandbox mirrors production data — same users, spaces, terminals, tasks —
so anyone with a prod account can log in and play around without affecting
real data.

- **Refresh script:** `scripts/mirror-prod-to-sandbox.mjs` runs entirely
  through Supabase's management API (no DB password). For each table in
  its allow-list, it reads via `SELECT jsonb_agg(t)` from prod and writes
  via `INSERT … SELECT FROM jsonb_populate_recordset(NULL::t, $)` on the
  sandbox, with `SET session_replication_role = replica` to keep
  triggers + FK constraints quiet during the load.
- **Tables covered:** `auth.users`, `auth.identities`, and every user-data
  table on prod (profiles, spaces, terminals, tasks, files, comments,
  message_threads, messages, activity, calendar_*, invites, notifications,
  access_tokens, api_keys, etc.). See the `TABLES` array in the script for
  the full list.
- **Sandbox-only tables stay untouched:** `modules_catalog`, `space_modules`,
  `terminal_modules`, `user_module_pins`, and the `goals_*` tables don't
  exist on prod and aren't in the mirror list, so their sandbox state is
  preserved across refreshes.
- **Encrypted passwords copy over.** Bcrypt hashes are project-independent
  so a user's prod password just works on sandbox after a refresh.
- **Schedule:** every other Sunday at 09:00 UTC (`schedule` cron in
  `refresh-sandbox.yml`). You can also run it manually via Actions UI.

### 9.1.3 Vercel env-var scopes

| Var | `production` value | `preview` value (= sandbox) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | sandbox project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | sandbox anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service-role key | sandbox service-role key |
| `NEXT_PUBLIC_APP_URL` | `https://rokki.ai` | `https://staging.rokki.ai` |
| `NEXT_PUBLIC_API_URL` | `https://rokki.ai/api` | `https://staging.rokki.ai/api` |
| Sentry, Axiom, Redis, etc. | same value across both targets | same value across both targets |

## 9.2 Repository layout

```
rokki/
├── .github/
│   └── workflows/           CI/CD workflows
├── apps/
│   ├── web/                 Next.js app (app.rokki.ai)
│   ├── mcp-server/          MCP server (mcp.rokki.ai)
│   ├── tool-executor/       Tool sandbox runner (tools.rokki.ai)
│   └── indexer/             RAG indexing worker
├── packages/
│   ├── db/                  Types + client for Supabase
│   ├── ui/                  Shared UI components (shadcn-based)
│   ├── tool-sdk/            @rokki/tool-sdk — for tool authors
│   └── cli/                 @rokki/cli — publish tools
├── supabase/
│   ├── migrations/          SQL migrations
│   ├── seed.sql             Dev seed data
│   └── config.toml          Local Supabase config
├── docker/                  Local dev containers (ClamAV, MinIO, Redis)
├── infra/                   Azure + Vercel infrastructure as code (Phase 2+)
│   └── terraform/
├── docs/                    This folder
├── BUILD_SPEC.md
├── CLAUDE.md
├── package.json             root; monorepo
├── pnpm-workspace.yaml
├── turbo.json               Turborepo pipeline
└── README.md
```

Monorepo tooling: **pnpm workspaces + Turborepo**. Workspaces share types via `@rokki/db`, `@rokki/ui`.

## 9.3 Local development

### 9.3.1 Prerequisites

- **Node 20.x** (use `nvm` or `asdf`)
- **pnpm 9.x** (`npm install -g pnpm`)
- **Docker Desktop** (for local Supabase + ClamAV + MinIO)
- **Supabase CLI** (`brew install supabase/tap/supabase` or [cli docs](https://supabase.com/docs/guides/cli))
- **Git**
- Windows users: WSL2 strongly recommended for the Docker + Supabase stack

### 9.3.2 First-time setup

```bash
git clone https://github.com/rokki-ai/rokki.git
cd rokki
pnpm install

# start local infra
supabase start              # Postgres, GoTrue, Storage, Realtime
docker compose up -d        # Redis, ClamAV, MinIO

# run migrations + seed
supabase db reset           # applies migrations + seed.sql

# copy env template
cp apps/web/.env.example apps/web/.env.local
cp apps/mcp-server/.env.example apps/mcp-server/.env.local
# Supabase CLI prints URLs + keys after `start`; paste them in

# start dev servers
pnpm dev                    # turbo runs all apps in parallel
```

Apps:
- Web: `http://localhost:3000`
- MCP: `http://localhost:3001`
- Tool executor: `http://localhost:3002`
- Indexer: background worker
- Supabase Studio: `http://localhost:54323`
- MinIO console: `http://localhost:9001`

### 9.3.3 Test users

`supabase/seed.sql` creates:
- `zack@test.rokki.ai` (platform admin)
- `carlos@test.rokki.ai` (architect)
- `maria@test.rokki.ai` (org member)
- `bank@test.rokki.ai` (lender)

Sign in locally: enter email → Supabase CLI logs the magic link to `supabase status` — no real email needed.

### 9.3.4 Local Blob (MinIO)

MinIO replaces Azure Blob locally. Same S3-compatible API; the storage adapter switches between Azure SDK and MinIO based on env:

```typescript
if (process.env.NODE_ENV === "development") {
  // MinIO via @aws-sdk/client-s3
} else {
  // Azure Blob via @azure/storage-blob
}
```

Abstracted behind a `StorageAdapter` interface (see §09.7).

### 9.3.5 Local virus scan

ClamAV runs in a Docker container. On upload finalize, `indexer` calls `clamscan` via socket. Fast (seconds) for test files.

### 9.3.6 Running tests

```bash
pnpm test              # unit + integration
pnpm test:e2e          # Playwright
pnpm test:load         # k6 load tests (optional)
pnpm typecheck
pnpm lint
```

## 9.4 Environment variables

### 9.4.1 `apps/web/.env.local`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>         # server-only

# Auth
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_MCP_URL=http://localhost:3001

# Storage
STORAGE_PROVIDER=minio                                   # minio | azure
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=rokki-files-local

# For staging/prod:
# AZURE_STORAGE_ACCOUNT=rokkifilesstaging
# AZURE_STORAGE_KEY=<from Azure>
# AZURE_STORAGE_CONTAINER=rokki-files

# Email (Resend in staging/prod; local logs to console)
EMAIL_PROVIDER=console                                   # console | resend
RESEND_API_KEY=<if provider=resend>

# Rate limiting
REDIS_URL=redis://localhost:6379

# Embeddings (for RAG)
OPENAI_API_KEY=<for text-embedding-3-small>

# KMS (for BYOK encryption) — local uses a fake
KMS_PROVIDER=local                                       # local | azure
KMS_LOCAL_KEY=<base64 32-byte key>                       # local dev only

# For staging/prod:
# AZURE_KEYVAULT_URL=https://rokki-kms-staging.vault.azure.net
# AZURE_KEYVAULT_KEY_NAME=rokki-master-key

# Observability (optional in local)
SENTRY_DSN=
AXIOM_TOKEN=
POSTHOG_KEY=

# Misc
NODE_ENV=development
LOG_LEVEL=debug
```

### 9.4.2 `apps/mcp-server/.env.local`

```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<same>
SUPABASE_SERVICE_ROLE_KEY=<same>
TOOL_EXECUTOR_URL=http://localhost:3002
TOOL_EXECUTOR_TOKEN=<shared secret; rotate quarterly>
REDIS_URL=redis://localhost:6379
PORT=3001
```

### 9.4.3 `apps/tool-executor/.env.local`

```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<same>
CALLBACK_URL=http://localhost:3001
CALLBACK_TOKEN_SECRET=<shared>
PORT=3002
```

### 9.4.4 Secret handling

- `.env.local` is gitignored
- `.env.example` is committed with placeholder values
- Staging/prod secrets live in Vercel + Azure secret stores, never in the repo
- CI/CD pulls from env store; no raw secrets in logs

## 9.5 CI/CD

### 9.5.1 Pipelines

`.github/workflows/ci.yml` (runs on every PR):

```yaml
name: CI
on: [pull_request]
jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build   # ensures no build errors
      - uses: supabase/setup-cli@v1
      - run: supabase db lint
      - run: pnpm test:migrations     # apply fresh, run checks

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm playwright install --with-deps
      - run: docker compose up -d
      - run: supabase start
      - run: pnpm test:e2e

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm audit --audit-level=high
      - uses: github/codeql-action/analyze@v3
```

### 9.5.2 Deploy pipelines

`.github/workflows/deploy-staging.yml` (runs on merge to `main`):

```yaml
name: Deploy staging
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - name: Apply migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL_STAGING }}
      - name: Deploy web to Vercel
        run: vercel deploy --prod --token $VERCEL_TOKEN --env NEXT_PUBLIC_ENV=staging
      - name: Deploy MCP to Azure Container Apps
        run: az containerapp update --name rokki-mcp-staging --image ...
      - name: Deploy tool-executor to Azure
        run: az containerapp update --name rokki-executor-staging --image ...
      - name: Smoke tests
        run: pnpm test:smoke --url=https://staging.rokki.ai
```

`.github/workflows/deploy-prod.yml` (manual trigger with approval):

```yaml
name: Deploy production
on:
  workflow_dispatch:
    inputs:
      confirm:
        description: 'Type "yes" to confirm production deploy'
        required: true
jobs:
  deploy:
    if: github.event.inputs.confirm == 'yes'
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://rokki.ai
    steps:
      # ... similar to staging but against prod endpoints
      # Run full smoke suite post-deploy; auto-rollback on failure
```

Production deploys require:
- `environment: production` with required reviewer (you)
- Manual confirm input
- Smoke tests must pass post-deploy
- Slack / email notification on deploy start + complete

### 9.5.3 Rollback

- **Code rollback:** `git revert <commit>` + redeploy; or Vercel "Promote previous deployment" (1-click)
- **Database rollback:** never auto-apply. If a migration breaks, apply a forward-fix migration. Keep DB migrations additive and reversible.
- **Container rollback:** `az containerapp revision list` → activate prior revision

## 9.6 Infrastructure

### 9.6.1 Cloudflare

- **DNS:** managed in Cloudflare for `rokki.ai`
- **Subdomains:** app, api, mcp, files, docs, status (§BUILD_SPEC.md)
- **SSL:** full-strict mode, universal SSL (free)
- **WAF:** rules for common attacks (OWASP top 10) — Cloudflare Pro $20/mo (Phase 2; Phase 1 uses free WAF rules)
- **CDN:** caching rules for static assets + `files.rokki.ai`

### 9.6.2 Vercel

- **Project:** `rokki-web` for `apps/web`
- **Domains:** `app.rokki.ai` → prod; `staging.rokki.ai` → staging; Preview URLs for PRs
- **Environment variables:** managed per-environment in Vercel dashboard
- **Functions:** Next.js API routes run as serverless; streaming routes (SSE) use Edge runtime
- **Analytics:** Vercel Analytics included (page views, Core Web Vitals)

### 9.6.3 Supabase

- **Project:** `rokki-prod` (prod), `rokki-staging` (staging)
- **Plan:** Free tier initially; upgrade to Pro ($25/mo) when > 500MB DB or > 1GB storage
- **Backups:** Pro tier includes daily automated backups + PITR
- **Realtime:** enabled on designated tables
- **Extensions:** pgcrypto, citext, pg_trgm, vector, unaccent (enabled via migration)

### 9.6.4 Azure

Resource group: `rokki-prod-rg` (prod), `rokki-staging-rg` (staging).

| Resource | Purpose | Phase 1 size |
|---|---|---|
| Storage Account | Blob for files | Standard LRS, hot tier |
| Container Apps Environment | Runs MCP + tool executor | Shared env |
| Key Vault | BYOK master key | Premium (HSM-backed) |
| Log Analytics | Centralized logs | Pay-as-you-go |
| Front Door | CDN + WAF for files (optional) | Standard |

Provisioned via Terraform (`infra/terraform/`). Phase 1 can be clicked through the portal; Terraform is required by Phase 2.

### 9.6.5 Other services

- **Resend** — email (magic links, invites, notifications)
- **Upstash Redis** — rate limiting, key cache
- **Sentry** — error tracking
- **Axiom** — log aggregation
- **PostHog** — product analytics, feature flags
- **BetterStack** — uptime monitoring for all endpoints

## 9.7 Storage adapter

The storage adapter interface lets the app swap backends (local MinIO in dev, Azure Blob in prod):

```typescript
export interface StorageAdapter {
  getUploadUrl(key: string, opts: UploadOpts): Promise<SignedUrl>;
  getDownloadUrl(key: string, opts: DownloadOpts): Promise<SignedUrl>;
  put(key: string, data: Buffer | ReadableStream, opts?: PutOpts): Promise<PutResult>;
  get(key: string): Promise<ReadableStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  head(key: string): Promise<HeadResult>;  // size + content-type
}

export function createStorageAdapter(): StorageAdapter {
  if (process.env.STORAGE_PROVIDER === "azure") return new AzureBlobAdapter();
  return new MinioAdapter();
}
```

## 9.8 LLM provider adapter

Same pattern for LLM calls inside platform tools:

```typescript
export interface LLMAdapter {
  generate(opts: GenerateOpts): Promise<GenerateResult>;
  embed(texts: string[]): Promise<number[][]>;
}

export function createLLMAdapter(provider: Provider, apiKey: string): LLMAdapter {
  switch (provider) {
    case "anthropic": return new AnthropicAdapter(apiKey);
    case "openai": return new OpenAIAdapter(apiKey);
    case "google": return new GoogleAdapter(apiKey);
  }
}
```

Used by:
- Tools that need LLM inference
- Indexer (for embeddings only)
- Web UI RAG (indirectly, via the `/ask` endpoint)

## 9.9 Database migrations

### 9.9.1 Workflow

1. Create a new migration: `supabase migration new add_foo_column`
2. Edit the generated SQL file in `supabase/migrations/`
3. Test locally: `supabase db reset` (resets + reapplies everything)
4. Commit
5. CI validates (lints SQL, runs against fresh DB)
6. Merging to main → auto-applies to staging
7. Prod deploy applies same migrations

### 9.9.2 Rules

- Migrations are additive (never delete data in Phase 1)
- Never edit a merged migration
- Every migration must include a `-- ROLLBACK:` comment at the end showing how to reverse (even if not automated)
- Breaking migrations (rename column, change type) use a "read-new-write-both" pattern:
  1. Migration adds new column
  2. Code writes both old + new
  3. Backfill data to new column
  4. Code reads only new column
  5. Migration drops old column (separate migration, in a later release)

### 9.9.3 Seed data

`supabase/seed.sql` runs only in local and staging. Never in production. Use the admin UI to seed production.

## 9.10 Backups & disaster recovery

### 9.10.1 Supabase

- Pro tier: daily automated backups, PITR to any second in the last 7 days
- Weekly manual snapshot to Azure Blob (outside Supabase) for defense-in-depth
- Monthly restore drill: spin up a fresh project from yesterday's backup, verify integrity

### 9.10.2 Azure Blob

- Built-in versioning + soft-delete (30 days)
- Cross-region replication for production (RA-GRS)
- Monthly restore drill

### 9.10.3 Application code

- GitHub is the primary repo; mirrored nightly to GitLab (via GitHub action)
- Release tags are signed

### 9.10.4 Recovery objectives

- **RPO (data loss tolerance):** 24 hours
- **RTO (time to recover):** 4 hours

These are aspirational for Phase 1 (best-effort). Phase 2+ with paying users would tighten.

### 9.10.5 Runbooks

`docs/runbooks/` directory contains step-by-step procedures:
- `db-restore.md` — restore Supabase from backup
- `blob-restore.md` — recover deleted files
- `secret-rotation.md` — rotate master keys, service tokens
- `incident-response.md` — breach response checklist
- `emergency-access.md` — invoking platform admin emergency access

## 9.11 Observability

See also §04.12 for logging discipline.

### 9.11.1 Logs

- Structured JSON logs via `pino`
- Shipped to Axiom (cloud) via HTTP
- Correlation IDs (`X-Request-Id`) propagated through all services
- Retention: 30 days default; 2 years for security events

### 9.11.2 Metrics

- Custom metrics via OpenTelemetry → Grafana Cloud (free tier covers Phase 1)
- Key metrics:
  - Request rate, error rate, p95 latency per endpoint
  - Tool invocation rate + cost
  - Upload/download bandwidth
  - Active user count (DAU/MAU)
  - DB query p95 time
  - WebSocket connections

### 9.11.3 Alerts

PagerDuty / BetterStack alerts:
- API error rate > 5% for 5min → warning
- API error rate > 10% for 2min → critical (page)
- DB query p95 > 2s → warning
- Storage > 80% quota → warning
- Daily spend > budget threshold → critical

### 9.11.4 Status page

`status.rokki.ai` — public, auto-updated from uptime checks. Users subscribe via email or RSS.

## 9.12 Domains & DNS

| Subdomain | Points to | TTL |
|---|---|---|
| `rokki.ai` | Marketing site (static, Cloudflare Pages) | 3600 |
| `www.rokki.ai` | 301 → `rokki.ai` | 3600 |
| `app.rokki.ai` | Vercel (CNAME) | 300 |
| `staging.rokki.ai` | Vercel | 300 |
| `api.rokki.ai` | Vercel | 300 |
| `mcp.rokki.ai` | Azure Container App | 300 |
| `files.rokki.ai` | Azure Blob (via Cloudflare) | 300 |
| `docs.rokki.ai` | Vercel or static | 300 |
| `status.rokki.ai` | BetterStack | 300 |

Email SPF / DKIM / DMARC for `rokki.ai`:
- SPF: `v=spf1 include:_spf.resend.com ~all`
- DKIM: per Resend setup
- DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@rokki.ai`

## 9.13 Cost targets

| Phase | Monthly cost |
|---|---|
| Phase 1 (0-20 users, internal) | $50-100 |
| Phase 2 (50 users, 5 orgs) | $150-300 |
| Phase 3 (200 users, 25 orgs) | $400-800 |

Budget alerts in Azure + Vercel + Supabase at 80% of target.

## 9.14 Common pitfalls

- **Never run `supabase db reset` against staging or production.** Destroys data. Reset is local-only.
- **Migrations run in strict order.** If you rebase a branch with a migration older than main's, the migration may apply after newer ones — use timestamps carefully.
- **Supabase Studio is great locally but not safe in production.** Disable or gate behind emergency admin access.
- **`.env.example` must stay in sync with `.env.local`** structure — a missing var in the example causes silent misconfigurations.
- **Service role key bypasses RLS.** Never set it as a public env var (`NEXT_PUBLIC_*`) — instant platform-wide data exposure.
- **Vercel preview URLs run Next.js fine but don't have production env vars** — if something works in prod but not in preview, it's likely the env delta.
- **Azure Container App cold start** can be 5-10 seconds for the MCP server. Enable "always-ready" replicas or warm with a periodic health check.
- **Realtime connections count toward Supabase plan limits.** Monitor concurrent WebSockets; a bug that opens-without-closing can burn through the budget.
- **MinIO's S3 API is 99% compatible with Azure but not 100%.** Block-level operations differ. Test the large-file upload path against both.
- **GitHub Actions minutes are free but not unlimited.** A test suite that runs in 5 minutes per PR × 10 PRs/day × 30 days = 1500 min/mo — still free, but watch cost if tests grow.
- **Don't commit `.env.local`** — the `.gitignore` must include it. Use `git check-ignore` to verify.
- **Staging should match production configuration,** not local-dev configuration. Test with real Azure Blob in staging, not MinIO. Bugs in the Azure adapter will be found there, not in dev.
- **The local Supabase instance uses a different JWT secret** than staging/prod. Tokens generated locally cannot be used against remote environments — and vice versa.
