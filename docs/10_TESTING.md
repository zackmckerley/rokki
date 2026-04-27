# 10 — Testing

**Scope:** Test strategy, frameworks, fixtures, and concrete examples for unit, integration, and end-to-end tests. Security tests and acceptance tests live here too.

## 10.1 Testing philosophy

- **Test the contract, not the implementation.** A test should fail when user-visible behavior breaks, not when internal refactors happen.
- **RLS must be tested directly.** Every RLS policy has at least one test that verifies both positive (user can see allowed rows) and negative (user cannot see others' rows).
- **E2E tests are slow but catch integration bugs.** Keep a small, high-value suite (~20 flows) — not comprehensive coverage.
- **Fast feedback matters more than full coverage.** Unit + integration tests must run in < 60s total.
- **Write a test when you fix a bug.** Bug without test = bug pending return.

## 10.2 Frameworks

| Layer | Framework |
|---|---|
| Unit (pure functions, utils) | **Vitest** — fast, ESM-native |
| Component (React) | **Vitest + Testing Library** |
| Integration (API routes, DB) | **Vitest + Supabase test harness** |
| End-to-end | **Playwright** |
| Load / performance | **k6** (optional, Phase 2) |
| Security / penetration | **OWASP ZAP** in CI (Phase 2) |

## 10.3 Directory layout

```
apps/web/
  src/
    lib/format.ts
    lib/format.test.ts          # colocated unit tests
  tests/
    integration/
      projects.test.ts
      files.test.ts
      rls.test.ts
    e2e/
      auth.spec.ts
      create-project.spec.ts
      invite-accept.spec.ts
    fixtures/
      users.ts
      projects.ts
      seed.ts

apps/mcp-server/
  tests/
    tools.test.ts
    sampling.test.ts

packages/db/
  tests/
    rls/
      files.test.sql
      tasks.test.sql
      tools.test.sql
```

## 10.4 Test database

Each test file starts with a clean, seeded DB state.

### 10.4.1 Setup

`tests/fixtures/seed.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

export async function seedDatabase(supabase) {
  await supabase.from("orgs").insert({ slug: "acme", name: "ACME", created_by: userId });
  // ... seed tasks, files, tools
}

export async function resetDatabase() {
  // Truncate all tables; re-run seed
}
```

### 10.4.2 Test isolation

- Each test file gets its own schema (Postgres supports `CREATE SCHEMA test_123`) OR uses `BEGIN`/`ROLLBACK` transaction wrappers
- `beforeEach` runs `resetDatabase` — cheap with in-memory Postgres (supabase CLI)
- Parallel test runs use separate Supabase instances (CI only; local runs serially)

### 10.4.3 Fixture users

```typescript
// tests/fixtures/users.ts
export const USERS = {
  ZACK: {
    id: "00000000-0000-0000-0000-000000000001",
    email: "zack@test.rokki.ai",
    isPlatformAdmin: true,
  },
  CARLOS: {
    id: "00000000-0000-0000-0000-000000000002",
    email: "carlos@test.rokki.ai",
  },
  MARIA: {
    id: "00000000-0000-0000-0000-000000000003",
    email: "maria@test.rokki.ai",
  },
  BANK: {
    id: "00000000-0000-0000-0000-000000000004",
    email: "bank@test.rokki.ai",
  },
};

export function supabaseAs(user) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${generateJWT(user)}` } },
  });
}
```

## 10.5 Unit tests

Pure functions, utils, format helpers.

### 10.5.1 Example: ticker generation

```typescript
// apps/web/src/lib/ticker.ts
export function generateTicker(name: string): string {
  const consonants = name.toUpperCase().replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, "");
  return consonants.slice(0, 4).padEnd(2, "0") || "PRJ";
}

// ticker.test.ts
import { describe, it, expect } from "vitest";
import { generateTicker } from "./ticker";

describe("generateTicker", () => {
  it("extracts consonants", () => {
    expect(generateTicker("Brickell Renovation")).toBe("BRCK");
  });
  it("pads short names", () => {
    expect(generateTicker("Oak")).toBe("K00");
  });
  it("falls back for all-vowel names", () => {
    expect(generateTicker("aio")).toBe("PRJ");
  });
});
```

### 10.5.2 Running

`pnpm test` runs all `*.test.ts` files in < 30s.

## 10.6 Component tests

React Testing Library — verify rendered output + interactions.

```typescript
// apps/web/src/components/TaskRow.test.tsx
import { render, screen } from "@testing-library/react";
import { TaskRow } from "./TaskRow";

const task = {
  id: "...", ticker_seq: 42, title: "Order windows",
  status: "todo", priority: 2,
  due_date: "2026-05-01", assignees: [],
};

test("displays ticker and title", () => {
  render(<TaskRow task={task} ticker="BRKL" />);
  expect(screen.getByText("BRKL-42")).toBeInTheDocument();
  expect(screen.getByText("Order windows")).toBeInTheDocument();
});

test("shows overdue styling when past due", () => {
  render(<TaskRow task={{ ...task, due_date: "2020-01-01" }} ticker="BRKL" />);
  expect(screen.getByTestId("due-date")).toHaveClass("text-danger");
});

test("keyboard shortcut 'D' marks complete", async () => {
  const onComplete = vi.fn();
  const user = userEvent.setup();
  render(<TaskRow task={task} ticker="BRKL" selected onComplete={onComplete} />);
  await user.keyboard("{Meta>}{Enter}{/Meta}");
  expect(onComplete).toHaveBeenCalledWith(task.id);
});
```

## 10.7 Integration tests

Hit real API routes + real DB. Use the Supabase test harness.

### 10.7.1 Example: task creation

```typescript
// tests/integration/tasks.test.ts
import { beforeEach, describe, it, expect } from "vitest";
import { supabaseAs, USERS, seedDatabase, resetDatabase } from "../fixtures";

beforeEach(async () => {
  await resetDatabase();
  await seedDatabase({
    orgs: [{ id: "org-1", slug: "acme", created_by: USERS.ZACK.id }],
    projects: [{ id: "proj-1", ticker: "ACME", org_id: "org-1", created_by: USERS.ZACK.id }],
    project_members: [
      { project_id: "proj-1", user_id: USERS.ZACK.id, role: "owner" },
      { project_id: "proj-1", user_id: USERS.CARLOS.id, role: "architect" },
    ],
  });
});

describe("POST /v1/projects/:ticker/tasks", () => {
  it("creates a task for project member", async () => {
    const res = await fetch("http://localhost:3000/api/v1/projects/ACME/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieFor(USERS.ZACK),
      },
      body: JSON.stringify({ title: "Order windows", priority: 2 }),
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.ticker_seq).toBe(1);
    expect(data.title).toBe("Order windows");
  });

  it("denies non-members with 404", async () => {
    const res = await fetch("http://localhost:3000/api/v1/projects/ACME/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieFor(USERS.MARIA),    // not a member
      },
      body: JSON.stringify({ title: "X" }),
    });
    expect(res.status).toBe(404);   // not 403 — avoid enumeration
  });

  it("auto-increments ticker_seq", async () => {
    await createTask(USERS.ZACK, "ACME", { title: "First" });
    const second = await createTask(USERS.ZACK, "ACME", { title: "Second" });
    expect(second.ticker_seq).toBe(2);
  });
});
```

## 10.8 RLS tests (critical)

Every RLS policy has dedicated tests. These run directly against Postgres without going through the API.

```typescript
// tests/integration/rls-files.test.ts
describe("files RLS", () => {
  beforeEach(async () => {
    await setupScenario({
      projects: [{ id: "proj-1", members: { zack: "owner", carlos: "architect" } }],
      files: [
        { id: "file-contract", project_id: "proj-1", visibility: "owners" },
        { id: "file-drawing", project_id: "proj-1", visibility: "project" },
      ],
    });
  });

  it("project owner sees all files", async () => {
    const { data } = await supabaseAs(USERS.ZACK).from("files").select("*");
    expect(data.map(f => f.id)).toEqual(expect.arrayContaining(["file-contract", "file-drawing"]));
  });

  it("architect sees drawing but not contract", async () => {
    const { data } = await supabaseAs(USERS.CARLOS).from("files").select("*");
    expect(data.map(f => f.id)).toEqual(["file-drawing"]);
  });

  it("non-member sees nothing", async () => {
    const { data } = await supabaseAs(USERS.MARIA).from("files").select("*");
    expect(data).toEqual([]);
  });

  it("custom visibility with role", async () => {
    await updateFile("file-contract", {
      visibility: "custom",
      visibility_roles: ["architect"],
    });
    const { data } = await supabaseAs(USERS.CARLOS).from("files").select("*");
    expect(data.map(f => f.id)).toEqual(expect.arrayContaining(["file-contract"]));
  });

  it("custom visibility with user", async () => {
    await updateFile("file-contract", {
      visibility: "custom",
      visibility_users: [USERS.MARIA.id],   // but maria is not a project member
    });
    const { data } = await supabaseAs(USERS.MARIA).from("files").select("*");
    expect(data).toEqual([]);   // project_member check still applies first
  });
});
```

## 10.9 End-to-end tests

Playwright, runs against a local dev server.

### 10.9.1 Example: invite acceptance

```typescript
// tests/e2e/invite-accept.spec.ts
import { test, expect } from "@playwright/test";

test("architect accepts invite via magic link", async ({ page }) => {
  // Platform admin invites carlos
  await page.goto("/login");
  await page.fill("input[name=email]", "zack@test.rokki.ai");
  await page.click("button:has-text('Send link')");
  const zackLink = await getLatestMagicLink("zack@test.rokki.ai");
  await page.goto(zackLink);
  await expect(page).toHaveURL(/\/$/); // dashboard

  // Create project + invite carlos
  await page.keyboard.press("Meta+K");
  await page.keyboard.type("New project");
  await page.keyboard.press("Enter");
  await page.fill("input[name=name]", "123 Brickell");
  await page.fill("input[name=ticker]", "BRKL");
  await page.click("button:has-text('Create')");

  await page.goto("/p/BRKL/members");
  await page.click("button:has-text('Invite')");
  await page.fill("input[name=email]", "carlos@test.rokki.ai");
  await page.selectOption("select[name=role]", "architect");
  await page.click("button:has-text('Send invite')");

  // Log out, log in as carlos via invite link
  const carlosLink = await getLatestMagicLink("carlos@test.rokki.ai");
  await page.context().clearCookies();
  await page.goto(carlosLink);

  // Should land on BRKL project with architect role
  await expect(page).toHaveURL(/\/p\/BRKL/);
  await expect(page.locator("text=123 Brickell")).toBeVisible();
  // File visibility check
  await page.click("button[data-function-key=F2]");
  // Architect should see drawings but not contracts (seeded)
  await expect(page.locator("text=A200_Rev3.pdf")).toBeVisible();
  await expect(page.locator("text=gc_contract.pdf")).not.toBeVisible();
});
```

### 10.9.2 Key E2E flows

| Flow | File |
|---|---|
| Sign in via magic link | `auth.spec.ts` |
| Create org, create project | `create-project.spec.ts` |
| Invite member, accept invite | `invite-accept.spec.ts` |
| Create task, assign, complete | `tasks.spec.ts` |
| Upload file, change permissions | `files.spec.ts` |
| Connect MCP, invoke tool from Claude | `mcp-integration.spec.ts` |
| Admin approves tool access request | `approvals.spec.ts` |
| Emergency access with audit trail | `emergency-access.spec.ts` |
| Real-time task update across two sessions | `realtime.spec.ts` |
| Offline mode / reconnect | `reconnect.spec.ts` |

### 10.9.3 E2E in CI

- Runs on PR against merge target
- Headless Chromium
- Screenshots + videos on failure, uploaded as artifacts
- Max duration: 10 minutes

## 10.10 MCP tests

Dedicated test suite for the MCP server.

```typescript
// apps/mcp-server/tests/tools.test.ts
import { MCPClient } from "@modelcontextprotocol/sdk/client";

test("authenticated client lists tools scoped to access", async () => {
  const client = new MCPClient({
    transport: new SSEClientTransport({
      url: "http://localhost:3001/v1/sse",
      headers: { Authorization: `Bearer ${testTokenFor(USERS.CARLOS)}` },
    }),
  });
  await client.connect();
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name);
  expect(names).toContain("rokki_list_projects");
  expect(names).toContain("rokki_list_tasks");
  // carlos doesn't have access to aerial_reels
  expect(names).not.toContain("aerial_reels");
});

test("invoking a tool respects project scope", async () => {
  const token = testTokenFor(USERS.CARLOS, { project_restrictions: ["proj-1"] });
  const client = await connect(token);
  const result = await client.callTool("rokki_list_projects", {});
  expect(result.projects.map(p => p.ticker)).toEqual(["BRKL"]); // only proj-1
});
```

## 10.11 Load / performance tests (Phase 2)

k6 scripts in `apps/web/tests/load/`.

```javascript
// tests/load/api-list-tasks.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 50,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<500"],
  },
};

export default function() {
  const res = http.get("https://staging.rokki.ai/api/v1/projects/BRKL/tasks", {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
  });
  check(res, { "status 200": (r) => r.status === 200 });
}
```

Run periodically against staging. Alerts on regression.

## 10.12 Security tests

### 10.12.1 Automated

- `npm audit` in CI (blocks high/critical)
- GitHub CodeQL
- OWASP ZAP baseline scan against staging weekly

### 10.12.2 Manual / penetration

Phase 2 milestone: contract a penetration test against staging. Scope:
- Auth flow (magic link abuse, session fixation)
- RLS bypass attempts
- SSRF via file upload / URL handling
- IDOR via direct blob URL guessing
- Rate limit bypass
- Emergency access audit trail integrity

## 10.13 Visual regression (optional)

Chromatic or Percy for Storybook. Catches CSS drift.

Phase 1: skip. Phase 2: enable when the design system stabilizes.

## 10.14 Smoke tests

Minimal "deploys still work" suite run post-deploy:

```typescript
// tests/smoke/prod-health.spec.ts
test("health endpoint returns 200", async () => {
  const res = await fetch("https://rokki.ai/api/v1/health");
  expect(res.status).toBe(200);
});

test("login page renders", async ({ page }) => {
  await page.goto("https://app.rokki.ai/login");
  await expect(page.locator("input[name=email]")).toBeVisible();
});

test("static assets served with correct content-type", async () => {
  const css = await fetch("https://app.rokki.ai/_next/static/.../style.css");
  expect(css.headers.get("content-type")).toMatch(/css/);
});
```

Runs in < 1 minute post-deploy. Failure → auto-rollback.

## 10.15 Test data privacy

- Never use production data in tests. Copy schemas, generate fake data.
- Fixture users have `@test.rokki.ai` emails — never send real email.
- Test API keys (BYOK) are strings like `sk-test-DONOTUSE` — provider APIs reject them cleanly.
- Test tokens are generated fresh per test run; purged at test end.

## 10.16 Coverage targets

| Layer | Target |
|---|---|
| Unit (utils, lib) | 80% line coverage |
| Component | 60% (critical paths covered; don't chase trivial props tests) |
| Integration (API routes) | 100% of happy paths, 80% of error paths |
| RLS policies | 100% — every policy has positive + negative tests |
| E2E | 20 key flows, not coverage-driven |

Coverage is a signal, not a goal. High coverage with bad tests is worse than lower coverage with good tests.

## 10.17 CI enforcement

- PR can't merge if:
  - Any test fails
  - Lint fails
  - Typecheck fails
  - `npm audit` has high/critical
  - Coverage drops below threshold (5% regression)

- PR warns but doesn't block if:
  - New code has < 80% coverage
  - Bundle size grew > 10KB

## 10.18 Running tests locally

```
pnpm test               # all unit + integration
pnpm test:watch         # Vitest watch mode
pnpm test:rls           # just RLS tests
pnpm test:e2e           # Playwright
pnpm test:e2e -- --ui   # Playwright UI mode for debugging
pnpm test:smoke         # quick post-deploy checks
pnpm typecheck          # tsc --noEmit across workspace
pnpm lint               # eslint + prettier --check
pnpm lint:fix           # auto-fix
```

## 10.19 Debugging failing tests

- Vitest: `--reporter=verbose` + `--bail` to stop on first failure
- Playwright: `--debug` opens Playwright Inspector; `--trace=on` saves a full trace
- Supabase RLS: set `app.debug_rls` to log policy evaluations
- E2E flakiness: check for unawaited promises first; actual race conditions are rare in Playwright

## 10.20 Common pitfalls

- **Tests sharing DB state fail randomly.** Always reset between tests. Parallel test runs need separate Supabase instances or transaction isolation.
- **Mocking the Supabase client loses RLS enforcement.** Integration tests must hit a real Postgres.
- **E2E tests flake without proper waits.** Use Playwright's auto-wait (`toBeVisible()`), never `waitForTimeout`.
- **Time-sensitive tests fail around DST / leap seconds.** Use `sinon.useFakeTimers` or inject clock.
- **Seeded data drifts from real schema.** Re-run `supabase db reset` weekly in CI to catch schema-vs-seed divergence.
- **Fixture emails that match real accounts** cause actual emails to send. Always use `@test.rokki.ai` or a similar guarded domain.
- **RLS tests that only check positive cases** miss the real bugs. Always test "can another user see this?" negative cases.
- **Snapshot tests become rubber-stamped.** Use them sparingly; prefer assertion-based tests that express intent.
- **Integration tests that depend on external APIs** (Google Maps, Anthropic) are flaky. Mock at the HTTP layer (msw) instead.
- **Coverage thresholds encourage writing tests for trivial code.** Focus on testing untested critical paths before chasing the last 10% of coverage.
- **Playwright-generated selectors** like `.page-abc > :nth-child(3)` break on every UI change. Use `data-testid` attributes for stable selectors.
- **Test timeouts set too low** (30s default) cause flakes on slow CI machines. Integration tests: 60s. E2E: 90s.

## 10.21 Bundle-size budget

Per-route first-load-JS budgets are enforced in CI by
`apps/web/scripts/check-bundle-size.mjs`. The script reads Next's build
manifests after `next build`, gzips each chunk, sums the union per route
(matching how Next reports "First Load JS"), and fails the build on
either of two conditions.

### 10.21.1 Per-route budgets (gzipped)

| Route bucket             | Budget |
|--------------------------|--------|
| Login page               | 100 KB |
| Dashboard                | 250 KB |
| Terminal page (`/p/...`) | 300 KB |
| Admin pages (`/admin/*`) | 200 KB |
| All other public pages   | 150 KB |

Pattern matching lives in `BUDGETS` in
`apps/web/scripts/check-bundle-size.mjs` — first match wins, so
specific patterns precede the catch-all.

### 10.21.2 Two failure modes

1. **Regression vs baseline.** A route that grows more than 5 KB
   gzipped vs the checked-in baseline at
   `apps/web/scripts/bundle-baseline.json` fails the check. This is
   the gate that catches "casually pulled in 200 KB of moment.js."

2. **New budget breach.** A route that exceeds its absolute budget for
   the first time fails the check. Pre-existing breaches in the
   baseline are carried — we pay them down deliberately, not on every
   PR.

### 10.21.3 Local commands

```bash
# Check both regressions and budget breaches against current baseline:
pnpm -C apps/web bundle:check

# Just produce the analyzer HTML reports under .next/analyze/:
pnpm -C apps/web bundle:analyze

# Refresh the baseline (intentional growth, e.g. new dependency):
pnpm -C apps/web bundle:check --update-baseline
git add apps/web/scripts/bundle-baseline.json
```

### 10.21.4 When the check fails on your PR

Look at the table the script prints:

- **Status `REGRESSED`** — your PR grew an existing route by >5 KB.
  Either trim the imports (look at `.next/analyze/client.html`) or
  refresh the baseline if the growth is intentional and reviewed.
- **Status `OVER`** — your PR put a route over its absolute budget for
  the first time. Don't ship without paying it down or getting an
  explicit decision to bump the budget in `BUDGETS`.
- **Status `REGRESSED, OVER`** — both. Don't refresh the baseline to
  hide an `OVER` — bumping the budget is the explicit conversation.

### 10.21.5 Why not Lighthouse CI?

Considered. Lighthouse CI adds 4-6 minutes per PR run and is flaky on
shared CI hardware (CPU contention skews scores). The bundle-size
gate catches the same regressions earlier and deterministically.
Lighthouse stays valuable for periodic audits run against staging,
not per-PR.
