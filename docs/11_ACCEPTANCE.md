# 11 — Acceptance Criteria

**Scope:** Concrete, runnable acceptance tests defining "done" for each phase. A phase is not complete until every item in its acceptance list passes — no excuses, no "partial credit."

**Rule:** Every item below is binary — pass or fail. Not "mostly works." Not "works in dev." Not "works except for X."

## 11.1 How to use this doc

- Before starting a phase, read its acceptance list
- Build vertical slices, not horizontal layers
- Run the acceptance checks continuously as you build
- Don't move to the next phase until every current-phase item passes
- If reality diverges from the spec, update the spec — don't skip the check

## 11.2 Phase 0 — Foundations

**Goal:** Infrastructure exists. A developer can clone the repo, run `pnpm install && pnpm dev`, and see the Rokki wordmark in a browser. Deploys to staging work.

### 11.2.1 Repository

- [ ] Repo exists at `github.com/<your-org>/rokki` with `main` branch
- [ ] `README.md` explains: what Rokki is, how to run locally, how to deploy
- [ ] `CLAUDE.md` and `docs/` folder present and up-to-date
- [ ] `.gitignore` excludes `.env*`, `node_modules`, `.next`, `dist`
- [ ] `LICENSE` present (or "UNLICENSED — all rights reserved" for internal)

### 11.2.2 Local dev

- [ ] `pnpm install` completes with zero warnings of missing deps
- [ ] `supabase start` brings up local Postgres + auth + storage
- [ ] `docker compose up -d` brings up Redis + MinIO + ClamAV
- [ ] `pnpm dev` starts web (port 3000), MCP (3001), tool-executor (3002), indexer
- [ ] `http://localhost:3000` loads the landing/login page without errors
- [ ] `pnpm typecheck` passes across workspace
- [ ] `pnpm lint` passes
- [ ] `pnpm test` runs and passes (even if only sample tests)

### 11.2.3 Design system applied

- [ ] Dark theme is the default
- [ ] Geist Sans loaded for body text; Geist Mono for monospace
- [ ] CSS variables from §08 are defined
- [ ] Tailwind config references tokens (no arbitrary values in use)
- [ ] Rokki wordmark displayed in lowercase Geist Sans with `letter-spacing: -0.02em`
- [ ] Light theme toggle works (settings → theme); no flash of wrong theme on reload

### 11.2.4 Database

- [ ] All tables from §01 exist after `supabase db reset`
- [ ] All enums exist
- [ ] All triggers fire correctly (test: insert a task, verify `ticker_seq` auto-sets)
- [ ] All RLS policies exist (verify via `SELECT * FROM pg_policies`)
- [ ] Seed data creates 4 test users with profiles

### 11.2.5 Deploys

- [ ] `main` branch deploys to staging.rokki.ai via GitHub Actions
- [ ] Production deploy workflow exists (manual trigger with approval required)
- [ ] `staging.rokki.ai` loads and shows the Rokki wordmark
- [ ] `https://api.rokki.ai/v1/health` returns 200 (in staging)

### 11.2.6 Observability stubs

- [ ] Sentry project created, DSN in env; a deliberate error shows up in Sentry
- [ ] Axiom log stream set up; one structured log appears
- [ ] Health endpoint queries DB + Blob to verify connectivity

### 11.2.7 Exit criteria

When all boxes above are checked, Phase 0 is complete. Move to Phase 1.

---

## 11.3 Phase 1 — Core MVP

**Goal:** Zack and 2-3 collaborators can use Rokki as their primary PM tool. Log in, create projects, invite members, manage tasks, upload files with permissions, chat with their AI via MCP.

### 11.3.1 Authentication

- [ ] New user lands on `/login`; enters email; clicks "Send link"; receives email (Resend in staging)
- [ ] Clicking link in email lands on `/` (dashboard) with session cookie set
- [ ] Second click on same link fails gracefully ("link already used")
- [ ] Expired link (> 15 min) shows friendly error
- [ ] Rate limit: 6th magic link request in 1 min returns 429
- [ ] Logout clears session and revokes refresh token

### 11.3.2 Orgs & projects

- [ ] First-time sign-in prompts to create an org (or auto-creates "Personal")
- [ ] User can create an org with slug + name; becomes owner
- [ ] User can create a project with ticker + name inside any org they own
- [ ] Ticker collision returns 409 with clear message
- [ ] Project list on dashboard shows all accessible projects
- [ ] Clicking a project opens its Terminal at `/p/:ticker`
- [ ] Project members can be invited via email with a role
- [ ] Invited user receives invite email; clicking accepts on sign-in
- [ ] Archiving a project removes it from the list but retains data

### 11.3.3 Project Terminal

- [ ] Top bar shows org ▸ project name ▸ ticker (ticker in monospace accent color)
- [ ] F2-F12 function keys visible and clickable
- [ ] Function-key shortcuts work (pressing `F2` opens files, `F3` opens tasks)
- [ ] 3-pane layout renders on desktop (≥ 1024px)
- [ ] Left/right panes can be resized by dragging; widths persist per user
- [ ] `⌘\\` toggles right pane; `⌘⇧\\` toggles left pane
- [ ] Ticker tape at top shows live project activity
- [ ] Command bar at bottom accepts typed commands (at minimum: `GO HOME`, `<TICKER> GO`)

### 11.3.4 Tasks

- [ ] Tasks view (F3) shows list of tasks in the project
- [ ] Task rows display: checkbox, ticker (e.g., `BRKL-42`), title, assignees, due date, priority, status pill
- [ ] Pressing `C` creates a new task inline (no modal)
- [ ] `J`/`K` navigate selection
- [ ] `Enter` opens task detail in right pane
- [ ] `⌘Enter` on selected task marks complete
- [ ] Status changes via `S` + letter (T/I/B/R/D)
- [ ] Priority via `P` + number (1-4)
- [ ] Assigning via `A` opens a member picker
- [ ] Due date via `D` opens a date picker
- [ ] Task creation sets `ticker_seq` auto-incrementing per project
- [ ] Completed task shows strikethrough + moves to bottom of default sort
- [ ] Real-time: change on one session appears in another session within 3s

### 11.3.5 Files

- [ ] Files view (F2) shows list with folder navigation
- [ ] Drag-drop upload works for files < 25 MB
- [ ] Files > 25 MB use the signed URL path (upload to Azure Blob directly)
- [ ] Upload progress bar shown
- [ ] Uploaded file appears in list with "Scanning..." state
- [ ] Virus scan (ClamAV locally) completes; "Scanning..." replaced with "Clean"
- [ ] PDF preview inline in right pane (via PDF.js or similar)
- [ ] Permission dialog: can set `project`, `owners`, or `custom` visibility
- [ ] Custom visibility: can select specific users or project roles
- [ ] Download button returns a signed URL that works for 5 minutes
- [ ] Signed URL expired past 5 min returns 403 from Azure
- [ ] Version history: uploading with same name offers supersede or rename
- [ ] Supersede keeps old version, marks it not-current
- [ ] Architect user cannot see `owners`-visibility file (404 on detail, missing from list)

### 11.3.6 Permissions & guests

- [ ] Project owner sees all files in the project regardless of visibility
- [ ] Architect guest (from another org) sees only the project they were invited to
- [ ] Guest cannot navigate to other orgs or projects — they appear not to exist
- [ ] Guest cannot invite others (unless given manager role)
- [ ] Removing a guest: they lose access within 30s (session force-expires)

### 11.3.7 AI integration (MCP)

- [ ] User can generate an access token in `/settings/tokens`
- [ ] Plaintext token shown once; subsequent views show only prefix
- [ ] Token can be scoped to specific projects
- [ ] Claude Desktop connects via MCP SSE with the token
- [ ] Connected Claude lists Rokki tools (`rokki_list_projects`, etc.)
- [ ] Claude can call `rokki_list_tasks({ticker: "BRKL"})` → returns tasks
- [ ] Claude can call `rokki_create_task(...)` with a write-scope token → task appears in web UI within 3s
- [ ] Claude can call `rokki_ask_project({ticker, question})` → returns RAG-based answer with citations
- [ ] Architect's Claude using architect's token sees ONLY BRKL project and files they have access to
- [ ] Architect's Claude trying to access Zack's other projects returns "not found"
- [ ] Revoking a token force-disconnects the MCP session within 30s

### 11.3.8 AI integration (web UI)

- [ ] Right pane AI chat visible on every project terminal
- [ ] Typing a question and pressing `⌘Enter` sends it
- [ ] Response streams token-by-token
- [ ] Citations render as clickable chips showing source file + page
- [ ] Clicking a citation opens the file at the relevant location
- [ ] AI respects the user's role — architect asking about contracts is told they don't have access

### 11.3.9 Activity & audit

- [ ] Every mutation writes an `activity` row
- [ ] Ticker tape shows recent activity in real-time
- [ ] User profile page shows their recent activity
- [ ] Admin panel shows all platform activity (platform admin only)

### 11.3.10 Acceptance test script

The following end-to-end test must pass (automated Playwright):

```
SCENARIO: Full user journey

1. Zack signs in via magic link (local inbox)
2. Zack creates org "HELIOS", project "123 Brickell" with ticker BRKL
3. Zack invites Carlos (architect) and Maria (org member) to BRKL
4. Maria signs in, sees BRKL in her list
5. Carlos signs in, sees BRKL in his list — confirmed: only BRKL
6. Zack uploads `permit.pdf` (size < 25 MB), visibility `owners`
7. Zack uploads `A200.pdf` (size > 25 MB via signed URL), visibility `project`
8. Carlos opens BRKL files; sees A200.pdf; does NOT see permit.pdf
9. Maria sees both (she's an org member → can see owner-level)
10. Zack creates token with write scope, project_restrictions = [BRKL]
11. Simulated Claude Desktop connects via MCP
12. Claude lists tools, sees rokki_list_projects; only project: BRKL
13. Claude calls rokki_ask_project({ticker: BRKL, question: "what permits are there"})
14. Response includes permit.pdf content (Zack can see it) with citation
15. Carlos generates his own token, connects his own Claude
16. Carlos's Claude asks the same question — response says "I don't have access to permit info"
17. Zack revokes his token; within 30s his Claude loses connection
18. Zack archives the project; it disappears from all members' dashboards
```

All 18 steps pass → Phase 1 is complete.

---

## 11.4 Phase 2 — Tool Marketplace

**Goal:** Users can publish custom tools; others can invoke them without seeing the code. Quotas, approvals, BYOK, and MCP sampling all work.

### 11.4.1 Publishing

- [ ] `@rokki/cli` installs globally and authenticates with a token
- [ ] `rokki push ./my-tool` uploads a tool with SKILL.md + scripts
- [ ] Server validates SKILL.md frontmatter; rejects invalid schemas with clear errors
- [ ] Server runs static analysis; rejects hardcoded secrets
- [ ] Server runs sandbox test; rejects if tool crashes on sample input
- [ ] First tool from non-admin enters `approvals` queue; admin sees it
- [ ] Admin approves → tool becomes `published`; appears in marketplace

### 11.4.2 Execution

- [ ] Tool executor spins up an isolated container per invocation
- [ ] Container has no network access except declared allowlist
- [ ] Container has no access to Rokki DB
- [ ] Tool SDK callback token permits only the invoking user's DB access (via RLS)
- [ ] Tool output validated against output_schema
- [ ] Tool timeout enforced (120s default; hard-kill at limit)
- [ ] Tool memory limit enforced
- [ ] Execution cost tracked in `tool_invocations`

### 11.4.3 Access control

- [ ] Tool visibility `private` — only owner sees
- [ ] `org` visibility — anyone in owner's org sees
- [ ] Explicit grant via `tool_access` works
- [ ] "Request access" flow: user clicks → approval created → admin sees it → approves → user can invoke within 30s (MCP `tools/list_changed`)
- [ ] `one_time` approval mode: first invocation waits for approval; subsequent free
- [ ] `per_invocation` mode: every invocation creates an approval

### 11.4.4 Quotas

- [ ] Quotas enforced before invocation (defensive deduct)
- [ ] Exceeded quota returns `quota_exceeded` error
- [ ] Successful invocation retains deduction; failed refunds
- [ ] Daily quotas reset at 00:00 UTC
- [ ] Admin can override quota per user

### 11.4.5 BYOK

- [ ] User adds Anthropic API key in `/settings/keys`
- [ ] Key encrypted with envelope encryption (wrapped DEK)
- [ ] Plaintext never returned after save
- [ ] Tool invocation injects decrypted key as env var; container exit clears it
- [ ] Revoking key blocks future invocations that require it

### 11.4.6 Sampling

- [ ] Tool declares `requires_providers: ['anthropic']`
- [ ] User with no BYOK invokes tool
- [ ] Tool executor requests sampling from user's Claude via MCP
- [ ] Claude Desktop auto-approves (if set) or prompts user
- [ ] Sampling response flows back to tool; tool completes
- [ ] Invocation cost is zero (user's subscription paid for inference)

### 11.4.7 Acceptance test script

```
SCENARIO: Tool publish + invoke by other user

1. Zack writes aerial-reels SKILL.md + index.js
2. rokki push uploads; tool appears in private state
3. Zack publishes it with visibility=org
4. Maria (same org) sees it in her marketplace
5. Maria's Claude (via MCP) calls rokki_list_tools — aerial_reels appears
6. Maria's Claude calls aerial_reels({address: "123 Brickell"})
7. Server validates access (org member), deducts 5 credits, dispatches
8. Container runs, calls Google Maps API, returns video URL
9. Maria's Claude receives output; shows to Maria
10. Activity logged with actor_token_id = Maria's token
11. Maria's credits decremented; visible in her profile
12. Carlos (not in org, has project guest access) doesn't see aerial_reels
13. Zack changes visibility to `project`, grants access to BRKL
14. Carlos now sees aerial_reels in his marketplace
15. Carlos invokes it; it works; cost goes to Carlos's quota, not Maria's
```

---

## 11.5 Phase 3 — Polish & Mobile

**Goal:** PWA works on iPhone home-screen. Native iOS + Android apps in beta. Real-time polished.

### 11.5.1 PWA

- [ ] `manifest.json` with icon, theme color, display: standalone
- [ ] Service worker caches app shell for offline first-paint
- [ ] "Add to Home Screen" on iOS creates a full-screen app
- [ ] Offline mode: viewing cached data works; mutations queue with visible "pending sync" state
- [ ] Push notifications (web push, Phase 3) for task assignment

### 11.5.2 Mobile app (Expo)

- [ ] Expo app builds for iOS + Android
- [ ] Magic link opens deep link into app
- [ ] Biometric unlock (Face ID, Touch ID) stores token in Keychain/Keystore
- [ ] Core screens: dashboard, project, tasks, files
- [ ] Camera integration: photo → attach to project
- [ ] Push notifications with tappable deep links
- [ ] Mobile-optimized layout (single column, tab bar)

### 11.5.3 UI polish

- [ ] Every screen audited for typography, spacing, motion
- [ ] Sound pack enabled (opt-in)
- [ ] Density mode toggle works; all views respond correctly
- [ ] Light theme parity (every screen verified in light)
- [ ] Keyboard cheatsheet (`?`) comprehensive and current

---

## 11.6 Phase 4 — Depth

Additional modules per BUILD_SPEC §13. Individual acceptance lists will be written when each module is scoped.

---

## 11.7 Rollback acceptance

Every phase must also prove rollback works:

- [ ] Production deploy of Phase N can be rolled back to Phase N-1 via 1-click Vercel promote
- [ ] Database migrations for Phase N are reversible (documented in ROLLBACK comment)
- [ ] Azure Container Apps revision rollback is documented in runbooks

## 11.8 Security acceptance (runs at every phase)

- [ ] `npm audit` clean (no high/critical)
- [ ] CodeQL scan clean
- [ ] RLS test coverage: 100% of policies have positive + negative test
- [ ] No secrets in git history (checked via `gitleaks`)
- [ ] CSP headers present and strict
- [ ] HTTPS enforced (HSTS preload)
- [ ] Token format + rotation documented and tested
- [ ] Emergency access audit trail verified with test

## 11.9 Performance acceptance

- [ ] Dashboard first load < 2s on 3G Fast (Chrome DevTools throttling)
- [ ] Project terminal first load < 3s on same
- [ ] API p95 latency < 200ms for read endpoints (staging load test)
- [ ] API p95 latency < 500ms for write endpoints
- [ ] Realtime event latency p95 < 1s

## 11.10 Accessibility acceptance

- [ ] axe-core audit: 0 critical, 0 serious issues per screen
- [ ] Keyboard-only navigation works for every primary task
- [ ] Color contrast verified against WCAG AA
- [ ] Screen reader (VoiceOver / NVDA) can navigate dashboard and create a task

## 11.11 Documentation acceptance

- [ ] Every doc in `docs/` is current (no TODOs, no outdated references)
- [ ] Every public API endpoint has OpenAPI spec entry
- [ ] Every MCP tool has clear description
- [ ] Every env var is documented in `.env.example` with comments
- [ ] Runbooks exist for: db restore, secret rotation, emergency access, incident response

## 11.12 Definition of "DONE"

A feature is done when:
1. All acceptance checks for its phase pass
2. It has unit + integration + (if user-facing) E2E tests
3. It's deployed to staging and manually verified
4. Docs are updated
5. No `TODO` comments remain in the implementation
6. Error cases are handled (not "fix later")
7. Observability: it emits logs + metrics where relevant

Anything less is not done — it's "partially implemented," which is the exact failure mode we set out to avoid.
