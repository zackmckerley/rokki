# Rokki — Orientation for Claude Code

You are implementing **Rokki** (`rokki.ai`), a work platform with a Bloomberg-inspired terminal aesthetic and AI-native design.

## Product terminology (read this first)

Rokki has two nested tenancy levels. The names changed on 2026-04-23 — any
older docs using the old names are wrong, treat this section as authoritative.

| Concept            | DB table          | What it is                                  |
| ------------------ | ----------------- | ------------------------------------------- |
| **Space**          | `spaces`          | The tenant: a company, family, or household. Contains people. |
| **Space member**   | `space_members`   | A person's role in a space (owner/admin/member). |
| **Terminal**       | `terminals`       | A single working context: a project, matter, client, goal. Has tasks, files, discussion. |
| **Terminal member**| `terminal_members`| A person's role on a specific terminal (owner/manager/member/guest). |

**Permissions model:**

- Only **platform administrators** (`profiles.is_platform_admin`) can create spaces.
- Only **owners / admins of a space** can create terminals inside that space.
- Any **member of a terminal** can create tasks, upload files, post comments.

Old docs sometimes say "project" or "organization" — read those as "terminal"
and "space" respectively. The `profiles.is_platform_admin` field pre-dated the
rename and still lives under its original name.

## Before you write any code

Read in this order:

1. `BUILD_SPEC.md` — vision, design philosophy, phase plan
2. `docs/00_OVERVIEW.md` — map of all detailed docs
3. `docs/01_DATA_MODEL.md` — Postgres schema + RLS (copy-paste-ready SQL)
4. `docs/02_API.md` — every REST endpoint
5. `docs/03_MCP.md` — MCP server, tools, sampling
6. `docs/04_AUTH_SECURITY.md` — magic links, tokens, encryption, CSP
7. `docs/05_FILES.md` — upload/download, virus scan, RAG indexing
8. `docs/06_TOOLS.md` — marketplace, sandbox, approvals, quotas
9. `docs/07_REALTIME.md` — pubsub, presence, ticker
10. `docs/08_UI_DESIGN.md` — tokens, components, keyboard shortcuts
11. `docs/09_ENVIRONMENTS.md` — local dev, staging, prod, CI/CD
12. `docs/10_TESTING.md` — test strategy + examples
13. `docs/11_ACCEPTANCE.md` — exact pass/fail criteria per phase
14. `docs/adr/*` — architecture decisions and rationale

Then confirm with Zack:
1. You've read the full spec (BUILD_SPEC + all 12 docs + 3 ADRs)
2. You understand the Terminal metaphor and the quality bar
3. Your Phase 0 plan (what you'll deliver first week, mapped to §11.2)

**Do not start writing code until those three things are clear.**

## The 14 docs are the source of truth

The docs in `docs/` are designed to be copy-pasteable specifications:
- `01_DATA_MODEL.md` has the actual SQL for every table, RLS policy, and trigger
- `02_API.md` has the exact endpoint paths and request/response shapes
- `08_UI_DESIGN.md` has the actual CSS variables and Tailwind config

When implementing, **do not guess**. Cross-reference the docs. If a doc is unclear or incomplete, update the doc first (with Zack's agreement), then code.

When reality diverges from the spec, **update the doc first**. A stale doc is worse than no doc.

## Non-negotiables

- **Dark theme first.** Light theme is secondary.
- **Keyboard-first.** Every primary action has a shortcut.
- **Dense, information-rich UI.** No empty hero sections. No Lorem Ipsum. No stock gradients.
- **No cute.** Rokki is serious software. Copy reads like a senior engineer, not a marketer.
- **Permissions enforced at the database (RLS)**, not just application code.
- **Every AI tool must work with per-user tokens** (never service-key shortcuts that bypass user-scoped permissions).
- **API + MCP parity.** Every feature available in UI is available via API and MCP tool. No exceptions.
- **Vertical slices over horizontal layers.** Build one feature end-to-end (DB → API → UI → test) before moving to the next.
- **Vertical-agnostic by default.** Rokki ships multiple project templates (general, construction, legal, etc.). Do not hardcode construction-specific labels, F-keys, metadata fields, or copy into shared components. Vertical specifics live in `apps/web/src/lib/project-templates.ts`.

## Stack summary

- **Web:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind + shadcn/ui
- **Auth + DB:** Supabase (Postgres, auth, RLS, realtime)
- **Files:** Azure Blob Storage + Cloudflare CDN
- **MCP server:** Node + TypeScript, SSE transport, Azure Container Apps
- **Tool executor:** Node + TypeScript, containerized sandbox, Azure Container Apps
- **Hosting:** Vercel (web + API), Cloudflare (DNS, CDN)
- **Observability:** Sentry, Axiom, PostHog
- **Rate limiting:** Upstash Redis

See `docs/adr/0001-stack-choices.md` for the rationale.

## Build order

Phases are defined in `BUILD_SPEC.md §13` and have concrete acceptance criteria in `docs/11_ACCEPTANCE.md`. You do not move from one phase to the next until every acceptance item passes.

- **Phase 0** (week 1): foundations — repo, infra, dark theme, deploy working
- **Phase 1** (weeks 2-6): core MVP — auth, projects, tasks, files, basic MCP
- **Phase 2** (weeks 7-10): tool marketplace — publish, execute, approve, quota
- **Phase 3** (weeks 11-14): polish + mobile — PWA, Expo app, real-time refinement
- **Phase 4** (ongoing): depth modules (budget, schedule, drawings, permits)

## When to ask Zack

- Architectural changes (switching DB, auth provider, hosting, core dependencies)
- Departures from the design system or any non-negotiable above
- Anything that costs money to run (Azure resources, paid tiers)
- Ambiguity about user-facing behavior
- Any acceptance criterion that looks wrong or impossible

## When to just do it

- File organization, naming, folder structure (within docs-specified layout)
- Implementation details that match the spec
- Tests, lint config, CI scaffolding
- Adding dev-only dependencies (eslint, prettier, vitest plugins, etc.)
- Writing ADRs for decisions you make within the spec's scope

## How to handle spec gaps

If you hit a question the docs don't answer:

1. **Search the docs** — the answer is often in a different section than you expect (e.g., permission logic is in `01_DATA_MODEL.md §1.7`, not `04_AUTH_SECURITY.md`)
2. **Check ADRs** — rationale for a design choice might be there
3. **Read the BUILD_SPEC** — high-level intent helps resolve low-level ambiguity
4. **If still unresolved, write the question down, assume the most conservative answer, and ask Zack in your next check-in**. Do not just pick and go — the thing you "just picked" becomes tech debt.

## How to handle implementation drift

If your code diverges from the spec:

- **If the spec is wrong:** update the doc first, commit it, then code the correct thing
- **If you didn't realize the spec said X:** revert, re-read, redo
- **If the spec is silent and you must choose:** write an ADR before you code, run it by Zack

Divergence without update is how partial implementations happen.

## Deliverables at end of Phase 0

Concrete list (also in `docs/11_ACCEPTANCE.md §11.2`):

1. Repo with `main` branch, proper `.gitignore`, `README.md`, `LICENSE`
2. `pnpm install && pnpm dev` works cleanly on a fresh clone
3. Supabase local stack + Docker services (MinIO, Redis, ClamAV) running
4. All migrations from `01_DATA_MODEL.md` applied via `supabase db reset`
5. All RLS policies in place and verified
6. Seed data creates 4 test users (zack / carlos / maria / bank)
7. Dark theme with Geist Sans + Geist Mono loaded
8. Rokki wordmark visible in top bar at `http://localhost:3000`
9. Staging deploy at `staging.rokki.ai` working
10. GitHub Actions CI running (lint, typecheck, test) on PR
11. Production deploy workflow exists (manual approval gate)
12. Sentry + Axiom integrated; a deliberate error traces through
13. `docs/adr/0001-stack-choices.md` exists (already written; verify accuracy)

Every item in `docs/11_ACCEPTANCE.md §11.2` must check green.

## Anti-patterns to watch for

- Writing code without reading the relevant doc section first
- Building horizontal layers (all DB, then all API, then all UI) — always vertical slices
- Adding features not in the spec "while I'm here"
- Skipping tests because the feature is small
- Using `any` in TypeScript — strict mode is non-negotiable
- Using service-role DB access for user-initiated operations
- Hardcoding values that are in `08_UI_DESIGN.md` as tokens
- Leaving `TODO` or `FIXME` comments in shipped code
- Shipping without updating docs for changes you made

Good luck. Build like the user's billing $800/hour for their time in this app.
