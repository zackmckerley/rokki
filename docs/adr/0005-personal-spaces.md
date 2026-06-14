# ADR 0005 — Personal spaces

**Date:** 2026-06-14
**Status:** Accepted

## Context

Rokki's tenancy model has one non-negotiable: **only platform admins can
create spaces** (`CLAUDE.md`, enforced by the `spaces_insert` RLS policy).
That's right for *shared* spaces (companies, families) — they're deliberate,
admin-provisioned tenants.

But a user has nowhere private to work. Every terminal lives in a shared
space, visible to that space's members. Zack asked for a personal place to
keep personal terminals/tasks that aren't tied to a company or family —
private by default, but still a real space he can create terminals inside.

The question is how to add a private per-user space without weakening the
"admins create spaces" rule, and how privacy interacts with platform-admin
oversight.

## Decision

Every user gets exactly **one** private **Personal space**: an ordinary
`spaces` row flagged `is_personal = true` with a single `personal_owner_id`,
auto-provisioned at signup and backfilled for existing users.

It is **system-provisioned, not user-created.** Provisioning runs inside the
existing `SECURITY DEFINER handle_new_user()` trigger, which bypasses
`spaces_insert`. So the user-facing rule is unchanged — a *user* still can't
call "create space"; the platform does it for them. The admin-only rule
stands for shared spaces; personal spaces are an automatic, system carve-out.

Rules, all enforced at the database (RLS), not just the UI:

- **Exactly one per user** — partial unique index on `(personal_owner_id)`.
- **Owner-only, no invites** — adding any other member is blocked.
- **Undeletable** — so the user always has a home; the explorer is never
  empty.
- **Isolated** — only the owner can see it (existing select policy already
  does this via membership).
- **Renamable** — display name only; `is_personal` / owner are immutable.
- **Works like any space** — the owner can create terminals, tasks, files,
  and comments inside it (the existing `terminals_insert` policy already
  permits the sole owner).

**Admin access: same as every other space.** We deliberately did **not** add
a privacy carve-out for admins, and we did **not** add new admin visibility.
Today no space is readable by a platform admin in a normal session — admin
reach to space/terminal/task data is only via `has_emergency_access()`
(break-glass, requires the `app.emergency_access` GUC) or the service-role
admin routes. Personal spaces inherit exactly that. So admins "see personal
spaces like the others" — no more, no less — which is what Zack asked for,
and it means zero new policy surface for admin access.

The UI pins the personal space to the top of the explorer with a person
glyph, disables drag-reorder on it, and hides the members/invites/danger-zone
controls on its settings page. `is_personal` is exposed on `loadDashSpaces`
and `GET /api/v1/orgs` for API + MCP parity.

## Alternatives considered

- **Privacy-first (hide contents from admins).** Rejected per Zack's call —
  he wants the same oversight he has over every space. Also simpler: it
  drops a whole special-case policy.
- **Let users self-create personal spaces via an RLS carve-out**
  (`WITH CHECK (is_personal AND personal_owner_id = auth.uid())`). Rejected —
  auto-provisioning is invisible and guarantees the "exactly one, always
  present" invariant without a user action that could create zero or many.
- **A separate `personal_workspaces` table.** Rejected — it would fork every
  terminal/task/file FK and RLS policy. Reusing `spaces` means terminals,
  tasks, files, modules, and all existing tooling work unchanged.

## Consequences

- The `spaces_insert` "admins only" policy is untouched; the carve-out lives
  entirely in `SECURITY DEFINER` provisioning.
- Two existing policies are rewritten (renamed cleanly while at it):
  `org_members_insert → space_members_insert` (+ no-invite-to-personal) and
  `orgs_delete → spaces_delete` (+ not-personal).
- A backfill creates one personal space for every existing user; the
  provisioning function is idempotent, so re-runs are safe.
- New users incur one extra row insert at signup (the personal space + its
  owner membership via the existing trigger).
- Open follow-ups (not built): per-user quota lane for personal spaces;
  optional "upgrade to shared" path. Both are additive.

See `docs/01_DATA_MODEL.md §1.14` for the schema and policy SQL and
`supabase/migrations/20260614120000_personal_spaces.sql` for the migration.
