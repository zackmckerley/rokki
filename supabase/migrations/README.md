# `supabase/migrations/` — conventions

This directory holds every Postgres schema change applied to Rokki, in
the order they were applied. Files are timestamped (`YYYYMMDDhhmmss_*.sql`)
so they sort chronologically — `supabase db reset` applies them top to
bottom against a fresh DB.

## File naming

```
<UTC-timestamp>_<snake_case_description>.sql
```

Example: `20260427050000_jobs.sql`.

The timestamp is the UTC time when the migration was first authored, not
when it was merged. Once a file is committed, **never change its name or
its contents** — collaborators may already have applied it locally.
Forward-fix instead: write a new migration that supersedes the old one.

## ROLLBACK convention (new migrations)

Every new migration **should** include a `-- ROLLBACK:` block at the
bottom containing the SQL needed to undo the migration. The block is
commented out so Postgres ignores it during forward apply, but the
test harness (`scripts/test-migrations.mjs`) parses it.

Format:

```sql
-- ... migration body above ...

CREATE TABLE foo (id uuid PRIMARY KEY);
CREATE INDEX idx_foo_x ON foo(x);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_foo_x;
-- DROP TABLE IF EXISTS foo;
```

Rules:

- Header is exactly `-- ROLLBACK:` on its own line (case-insensitive,
  whitespace-tolerant).
- Every line of the rollback SQL is a comment (`-- `) so the forward
  apply step skips it.
- Use `IF EXISTS` everywhere so re-runs are safe.
- Reverse-apply order: drop indexes before the tables they index, drop
  RLS policies before disabling RLS, drop triggers before dropping the
  function they call.
- Don't try to roll back data migrations (UPDATE/INSERT). Document why
  the file is forward-only in a top-of-file comment.

If a migration is genuinely irreversible (DROP COLUMN with data, RENAME
of a heavily-referenced table, etc.), omit the ROLLBACK block and add a
`-- FORWARD-ONLY: ...` comment at the top explaining why.

## Existing migrations are grandfathered

Migrations authored before this convention existed do not carry SQL
ROLLBACK blocks (a few have English-prose ROLLBACK notes — those are
not parsed as executable SQL). The harness reports them as
`forward-only` and does not fail the build.

## Running the harness

```bash
pnpm migrations:test
```

Static analysis only — does not need a running database. Output:

```
Migration harness — N files in supabase/migrations

  [ROLLBACK] 20260427050000_jobs.sql  (5171B)
  [fwd-only] 20260427010000_admin_ops.sql  (1887B)
  ...

Summary: 3 with rollback, 34 forward-only, 0 broken
```

A migration shows up as **broken** only if it's structurally invalid
(empty file, unbalanced dollar quotes, ROLLBACK header with no body,
non-comment lines in a ROLLBACK block, etc.) — not for missing
ROLLBACK on legacy files.

To exercise rollback round-trips against a live local Supabase
(`supabase start` running):

```bash
pnpm migrations:test -- --apply
```

That mode rolls back each migration with a declared ROLLBACK and
re-applies it, leaving the database in the same state. Failures here
indicate a broken rollback statement (typo, missing IF EXISTS, etc.).

## CI

The harness runs as part of the `db-lint` job in
`.github/workflows/ci.yml`. PRs that introduce a structurally invalid
migration will fail.

## When to use a migration

- Schema changes (new tables, columns, constraints, indexes)
- New / changed RLS policies and helper functions
- Trigger and stored-procedure changes
- Realtime publication membership

Don't use migrations for:

- Seed data (use `supabase/seed.sql` or `apps/web/scripts/seed.ts`)
- Configuration that changes per environment (use platform_config
  rows or env vars)
