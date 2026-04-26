# E2E test suite (Playwright)

Covers the 20 critical user flows from `docs/10_TESTING.md §10.9`.

## What runs

| Spec file                         | Flows |
| --------------------------------- | ----- |
| `smoke.spec.ts`                   | login renders, help page, ? overlay, rate limits |
| `auth-and-nav.spec.ts`            | 1–5: sign-in (email + username), sign-out, account ring, command palette |
| `spaces-and-tasks.spec.ts`        | 6–11: create space, terminal, task; mark done, subtasks, sort |
| `files-and-comments.spec.ts`      | 12–16: file upload (POST + drag-drop), @mention comment, edit/delete, notification bell |
| `admin-and-discovery.spec.ts`     | 17–20: explorer-rail filter, /admin overview, users table, ? cheatsheet |
| `acceptance.spec.ts`              | Full 18-step §11.3.10 walkthrough |

## Prerequisites

Most flows need a real Postgres + seeded users:

1. **Supabase running locally:** `supabase start` (CLI 1.200+) — port 54321
2. **Migrations + seed applied:** `supabase db reset` then `pnpm db:seed`
3. **Dev server up:** `pnpm dev` in another terminal — must run with
   `NODE_ENV != production` so `/api/dev/session-as` is enabled
4. **Seeded users present:** admin / zack / carlos / maria / bank

Set the gate env var before running:

```bash
# Minimal (smoke only):
pnpm -C apps/web test:e2e tests/e2e/smoke.spec.ts

# Full DB-backed flows:
E2E_SEEDED=true pnpm -C apps/web test:e2e
```

Without `E2E_SEEDED=true`, every DB-backed test calls `test.skip()` and exits 0,
so dev machines without a seeded local stack don't fail the build.

## Auth shortcut

Tests authenticate via `POST /api/dev/session-as { email }`, which is
dev-only (404s in production). See `helpers.ts` — `apiAs()` returns an
authenticated `APIRequestContext`, `signInAs()` also pushes the cookies
into a browser context for `page.goto()` flows.

## Selectors

- Prefer `getByRole({ name: ... })` and `getByLabel(...)` over CSS
- Use `getByText` only for static copy that's unlikely to change
- Avoid `nth-child` and class-based selectors — they break on UI tweaks

## CI

Runs on PR via `.github/workflows/ci.yml` → `playwright` job. Only the
smoke suite runs in CI today — DB-backed flows need either:

1. A Supabase test instance provisioned in CI (slow, brittle)
2. The full Docker stack (supabase + minio + clamav) — TODO

See `docs/10_TESTING.md §10.9.3` for the long-term plan.

## Running a single spec

```bash
pnpm -C apps/web test:e2e tests/e2e/auth-and-nav.spec.ts

# Headed / debug:
pnpm -C apps/web test:e2e tests/e2e/auth-and-nav.spec.ts --headed
pnpm -C apps/web test:e2e --ui
```

## Updating selectors

If a test breaks because a UI element moved:

1. Run `pnpm -C apps/web test:e2e --debug` and inspect the failing locator
2. Prefer fixing the test to making the UI more brittle
3. If the role/label changed deliberately, update the test in the same
   PR as the UI change
