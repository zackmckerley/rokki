# Load tests (k6)

Five k6 scenarios covering the perf surfaces we care about: anonymous
SSR, authenticated reads, write mix, search, and realtime presence.
The scripts ship as ready-to-run k6 JS — no build step, no npm install,
no transpilation. They live here (not under `apps/web/tests/`) so they
can be invoked from a CI runner that has nothing but git + k6 installed.

## When to run these

- **Before any release** — run `01-anonymous` and `02-authed-dashboard`
  as the smoke baseline. If either regresses by >20% on the p95, dig
  in before shipping.
- **After any database schema change** — `02` and `03` shake out
  missing indexes faster than reading EXPLAIN plans.
- **After any change to the realtime layer** — `05`. Easy to break
  with a misconfigured channel name or a bad RLS policy on the
  channel target table.
- **Quarterly** — full sequence as a baseline-drift check.

## Prerequisites

k6 is a Go binary, not an npm package — install it directly:

```sh
# macOS
brew install k6

# Windows
choco install k6

# Linux (Debian/Ubuntu)
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 && \
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list && \
  sudo apt-get update && sudo apt-get install k6

# Anywhere with Docker
docker run --rm -i grafana/k6 run - < tests/load/01-anonymous.js
```

Verify:

```sh
k6 version
```

## Environment variables

| Var | Used by | What it is |
|---|---|---|
| `K6_BASE_URL` | all HTTP scenarios | Origin of the deploy under test, e.g. `https://staging.rokki.ai`. Defaults to `http://localhost:3000`. |
| `K6_SESSION_COOKIE` | `02`, `03`, `04` | The full `Cookie` header from a signed-in browser session — paste the `sb-*` cookies as you'd send them. **Use a load-test account, not your real one.** |
| `K6_TICKER` | `03` | Ticker of the terminal that load-test tasks should be created in. Defaults to `LOAD`. |
| `K6_SUPABASE_URL` | `05` | Supabase project URL, e.g. `https://abc.supabase.co`. |
| `K6_SUPABASE_ANON_KEY` | `05` | Supabase anon key (safe to share — it's the same key the browser uses). |
| `K6_ACCESS_TOKEN` | `05` | Bearer access token for the load-test user. Lives 1 hour by default; refresh between long runs. |
| `K6_PRESENCE_CHANNEL` | `05` | Presence channel topic, e.g. `presence:01HXXXXXXXX`. Mirrors what `TeamPane.tsx` builds. |

### Capturing a session cookie

Sign in to the staging deploy as your load-test user, open DevTools →
Application → Cookies, and copy the value of every `sb-*` cookie into
one `name=value; name=value` string. Pass it as `K6_SESSION_COOKIE`.

The shorthand we use:

```sh
export K6_SESSION_COOKIE="sb-access-token=<...>; sb-refresh-token=<...>"
```

Tokens expire — refresh by signing in again.

## Running each scenario

```sh
# 01 — anonymous baseline (no auth needed)
K6_BASE_URL=https://staging.rokki.ai \
  k6 run tests/load/01-anonymous.js

# 02 — authed dashboard reads
K6_BASE_URL=https://staging.rokki.ai \
K6_SESSION_COOKIE="$COOKIE" \
  k6 run tests/load/02-authed-dashboard.js

# 03 — task write mix
K6_BASE_URL=https://staging.rokki.ai \
K6_SESSION_COOKIE="$COOKIE" \
K6_TICKER=LOAD \
  k6 run tests/load/03-task-write.js

# 04 — search
K6_BASE_URL=https://staging.rokki.ai \
K6_SESSION_COOKIE="$COOKIE" \
  k6 run tests/load/04-search.js

# 05 — realtime presence
K6_SUPABASE_URL=https://your-project.supabase.co \
K6_SUPABASE_ANON_KEY=eyJ... \
K6_ACCESS_TOKEN=eyJ... \
K6_PRESENCE_CHANNEL=presence:01HXXXXXXXX \
  k6 run tests/load/05-realtime.js
```

### Useful flags

- `--summary-trend-stats="avg,p(95),p(99),max"` — extra columns in the
  end-of-run summary. Easier to spot tail-latency regressions.
- `--out json=run.json` — full per-request log for offline analysis.
- `--quiet` — suppress per-iteration output for CI logs.
- `-e KEY=VALUE` — alternative to setting env vars in the shell.

## Recommended baseline run

Before any release that touches the API or DB, run this sequence
against staging from a clean machine:

```sh
k6 run tests/load/01-anonymous.js
k6 run tests/load/02-authed-dashboard.js
k6 run tests/load/03-task-write.js
k6 run tests/load/04-search.js   # if the search route is shipped
k6 run tests/load/05-realtime.js
```

Expected total wall-clock: ~50 minutes (each scenario is a 10-12 min
ramp/hold/ramp). Run them in parallel only if you want to test combined
load specifically — the single-scenario runs are the comparable baseline.

Save the summary line for each one in the release notes:

```
✓ checks.........: 99.94% ✓ 12345 ✗ 7
✓ http_req_duration..: avg=187.43ms min=22.10ms med=156.20ms max=841ms p(90)=298ms p(95)=412ms
```

## Acceptance thresholds

Each scenario has thresholds baked in via `options.thresholds` — k6
will exit non-zero if they fail, so CI can pipe straight to a status
check.

| Scenario | p95 | Error rate |
|---|---|---|
| 01 anonymous | < 500ms | < 1% |
| 02 authed dashboard | < 800ms | < 1% |
| 03 task write | < 1500ms | < 1% |
| 04 search | < 1000ms | < 2% |
| 05 realtime connect | < 1500ms | < 1% errors, > 99% subscribe success |

These are the "should pass on a healthy staging" numbers. If they're
too tight for your environment, edit the `thresholds` block in the
scenario file rather than ignoring the failure.

## CI wiring

There's no GitHub Actions workflow today — staging doesn't exist yet,
so there's nothing to run against. Once staging is up:

> When you have a staging env, wire `pnpm load:smoke` (the lightest
> scenario) into CI as an optional manual workflow. Run it on a
> `workflow_dispatch` trigger so it never blocks PRs but is one click
> away when you want a sanity check.

Suggested first iteration: a `.github/workflows/loadtest.yml` with
`on: workflow_dispatch`, an input for which scenario to run, and a
single step that installs k6 + executes the script. Add a second
trigger on push-to-main once we trust it.

## Output and analysis

k6 prints a summary table at the end. The fields that matter:

- **`checks`** — % of `check()` assertions that passed.
- **`http_req_duration`** — request latency distribution. p95 is the
  load-bearing number; avg lies when you have a long tail.
- **`http_req_failed`** — % of requests that didn't return 2xx/3xx.
- **`vus`** — concurrent virtual users at the snapshot moment.
- **Custom metrics** — `anonymous_failures`, `task_write_failures`,
  `ws_subscribe_success`, etc. — defined per scenario and threshold-
  enforced.

For deeper analysis pipe `--out json=run.json` and inspect with
[k6-reporter](https://github.com/benc-uk/k6-reporter), or push to
Grafana Cloud k6 if we ever buy a license.

## Sentry interaction

When `SENTRY_TRACES > 0` on the deploy under test, every load-test
request fans into Sentry transactions. At p(95)<800ms and 30-50 RPS
that's a meaningful cost spike — check Sentry billing after a long
run, or temporarily set `SENTRY_TRACES=0` on the staging deploy
while load-testing.

For correlated traces, every request sends a `User-Agent: rokki-loadtest/<scenario>`
header. Filter by that in Sentry to slice load-test traffic away from
real usage.
