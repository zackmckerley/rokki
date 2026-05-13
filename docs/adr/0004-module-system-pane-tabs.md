# ADR 0004 — Module system: tabs in the pane header, not links in the sidebar

**Date:** 2026-05-13
**Status:** Accepted

## Context

Rokki is growing past "Tasks + Files + Calendar." Goals is ready to port
in from `Claude/rokki-goals/`. Files is becoming its own surface.
Messenger is a separate noun, not an afterthought. Future depth modules
(Capital Stack, Title, Closing for real estate; Permits, Drawings,
Schedule for construction) follow the same pattern: each is its own
working surface that needs to mount at the user, space, and terminal
levels.

The current sidebar packs these as links — once we add 5+ modules per
scope it stops scaling: the rail becomes a list of nouns the user has
to scan for the noun they want, and the actual "which space am I in"
context gets pushed off-screen.

The alternative — putting modules in the pane header as tabs — was
prototyped in `Claude/rokki-goals/public/sketch.html` and worked.

Two questions to answer:
1. **Where do modules live in the UI?** Sidebar links vs. pane tabs.
2. **How do they install?** Per-scope (each space/terminal picks its
   own set) vs. global (every scope has every module).

## Decision

**Modules render as tabs inside each pane's header.** Sidebar is
scope-only (Home + Spaces + Terminals). Multi-pane (single / split-2 /
grid-4) is supported so the user can have two modules visible at once
without losing the scope context.

**Modules install per-scope** with a per-user pin layer on top:

- `space_modules` and `terminal_modules` track what's installed at each
  scope. Install is an explicit action by a space/terminal admin.
- `user_module_pins` is per-user-per-scope and controls which installed
  modules show as tabs vs. live in the `⋯ More` overflow, plus optional
  F-key bindings (F5–F10).

A few specifics that come with this decision:

- **"Overview" is not a module.** It's a synthesized landing screen the
  pane shell renders when no specific module is loaded for a scope.
  Never appears in `modules_catalog`.
- **User-aggregated views get separate URLs.** Each module's user view
  is at `/app/<slug>` (e.g. `/app/goals`, `/app/tasks`). Not a single
  dashboard with filter chips.
- **Templates carry module lists.** Each project template in
  `apps/web/src/lib/project-templates.ts` declares the slugs it
  auto-installs. No new templates table.
- **Tools are not coupled to modules in v1.** Removed from the
  `ModuleManifest` contract entirely; they'll return as a separate
  effort per BUILD_SPEC Phase 2.

The new UI ships behind the `pane_shell_enabled` feature flag, off by
default until each phase passes acceptance.

## Consequences

**Positives:**
- Sidebar stays scannable. 5+ spaces × 5+ terminals × 5+ modules used
  to be a 75-link rail; it's now a 10-row rail with modules surfaced
  only when the user is *in* a scope that uses them.
- Per-scope install means a real-estate space gets RE modules without
  forcing them on a Personal space. Templates make the common case
  one click.
- The pane-tab pattern composes — `⌘2` to split, look at Goals in one
  pane and Tasks in the other, both rooted in the same scope.
- Adding a module is a manifest entry + a route. No sidebar surgery,
  no new top-level page.

**Negatives / risks:**
- **More tables than a pure links-in-sidebar approach.** Four new
  tables (`modules_catalog`, `space_modules`, `terminal_modules`,
  `user_module_pins`) instead of zero.
  Mitigation: each is small, additive, and reversible. RLS policies
  mirror the existing scope-membership patterns exactly.
- **Per-scope install requires admin action.** A space owner has to
  install Tasks on every terminal they create — friction.
  Mitigation: templates do the bulk install at creation time; the
  marketplace surface makes one-off installs cheap.
- **Two ways to "go to Tasks": scope first then tab, or tab first
  then scope.** We need to make sure the URL structure and `⌘K`
  search make both flows feel native.
- **Old routes stay for the duration of the rollout.** `/tasks`,
  `/calendar`, `/messages` are alongside `/app/tasks`,
  `/app/schedule`, `/app/messenger`. Deletion happens only after
  the flag has been on for staff for ≥1 week without issue.

## Rollback strategy

See `MODULE_PLAN.md §11` for the full recipes. Summary:

1. **Restore point:** tag `v0-pre-modules` on main before any code
   lands. Permanent named pointer.
2. **Additive only:** new tables, never `DROP COLUMN` or `ALTER TYPE`
   on existing tables. Every migration has a paired `.down.sql`.
3. **Feature flag:** `pane_shell_enabled` off by default. Staff flips
   it for themselves first; users never see the new UI until the flag
   flips for them.

Reverting at any phase reduces to: flag off → revert merge commit →
run `.down.sql`. User data in the new tables is orphaned but
recoverable.

## Alternatives considered

**Modules as sidebar links (status quo, extended).** Rejected: doesn't
scale past ~5 modules per scope; the rail becomes a noun-soup that
buries the scope context.

**One global module set (no per-scope install).** Rejected: a Personal
space doesn't need Capital Stack, a HELIOS space does. Forcing every
module on every scope clutters the tab strip and adds noise.

**Modules as a top-level concept independent of scope (e.g. a "Goals"
app that lists every space's goals).** Rejected as the primary surface:
the user-aggregated views *do* exist (`/app/goals` etc.) but they're a
secondary view, not the default. The default is "I'm in HELIOS, here's
HELIOS's Goals."

**Drag-to-rearrange-the-sidebar.** Rejected: customization without a
strong default produces 100 unique UIs that we have to support.
Per-user pins inside a stable scope structure is the compromise.

## References

- `Claude/rokki-goals/MODULE_PLAN.md` — full implementation plan
- `Claude/rokki-goals/public/sketch.html` — clickable v5 mockup
- `docs/08_UI_DESIGN.md §8.15` — pane shell + tab pattern spec
- `docs/01_DATA_MODEL.md §1.13` — module system tables
