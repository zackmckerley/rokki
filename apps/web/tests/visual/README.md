# Visual regression suite

Playwright snapshot tests guarding the look-and-feel of every critical
surface. Baselines live next to each spec under `__snapshots__/` and
are regenerated with `--update-snapshots`.

## Coverage

| Spec                              | Snapshots |
| --------------------------------- | --------- |
| `public-pages.spec.ts`            | login (idle, error, show-pw), 404, 500, forbidden |
| `dashboard-and-panes.spec.ts`     | empty dashboard, TasksPane (5 tasks), FilesPane (3 imgs + 5 non-imgs), bell (closed/open/empty), explorer rail (collapsed/expanded/filtered), command palette |
| `admin.spec.ts`                   | admin overview, admin users table |

## Running

```bash
# First time on a clean checkout — creates baselines:
pnpm -C apps/web test:e2e --project=visual --update-snapshots

# Subsequent runs (compare against baselines):
pnpm -C apps/web test:e2e --project=visual

# Single spec:
pnpm -C apps/web test:e2e --project=visual tests/visual/public-pages.spec.ts
```

Authenticated specs need `E2E_SEEDED=true` plus a running dev server
+ seeded Supabase, same as the E2E suite.

## CI policy

Visual snapshot diffs do **not** auto-fail CI. The
`.github/workflows/ci.yml` `visual-regression` job runs with
`continue-on-error: true` so a mismatch is surfaced as a check that
needs human review, not a hard merge blocker.

The reasoning: visual diffs catch real regressions but also fire on
legitimate design changes — gating merges on them produces test debt
and design pushback. Humans look at the screenshot diff in the PR
artifact, accept it (run `--update-snapshots` and commit) or fix the
regression.

## Reducing flakiness

The `playwright.config.ts` visual project pins:

- Viewport `1280x800`
- `colorScheme: "dark"` so OS preference doesn't flip the theme
- `animations: "disabled"` and `caret: "hide"` in `expect.toHaveScreenshot`
- `maxDiffPixelRatio: 0.02` (≈ 25k of 1.024M pixels can drift)

Volatile content (timestamps, KPI numerals) is masked with the
`mask` option on a per-spec basis.

## Updating baselines

If a UI change is intentional:

```bash
pnpm -C apps/web test:e2e --project=visual --update-snapshots
git add apps/web/tests/visual/__snapshots__
git commit -m "chore(visual): refresh baselines after <change>"
```

Always do this in the same PR as the UI change so reviewers can see
what they're approving.

## Known aspirational snapshots

A few baselines capture features that aren't fully shipped (e.g. the
login show-password toggle). The tests soft-assert toggle presence
and snapshot whatever IS rendered — when the toggle ships, refresh
the baseline.
