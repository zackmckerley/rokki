// k6 — anonymous load
//
// Sustained anonymous traffic on the public marketing / unauthenticated
// surfaces. No session, no cookies, no user-derived state. This is the
// cheapest baseline a deploy needs to survive — if it fails here we
// haven't even shaken out CDN / SSR config.
//
// Run:
//   K6_BASE_URL=https://staging.rokki.ai k6 run tests/load/01-anonymous.js
//
// See tests/load/README.md for setup.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = (__ENV.K6_BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

// Custom failure-rate metric so the threshold below reads meaningfully
// in the summary table. (k6's default `http_req_failed` lumps all hosts.)
const failureRate = new Rate("anonymous_failures");

export const options = {
  // Ramp 1 -> 50 over 5min, hold 5min, ramp down. Closed-loop model:
  // each VU sleeps 1s between requests, so steady-state is ~50 RPS,
  // not "50 concurrent in-flight requests".
  stages: [
    { duration: "5m", target: 50 },
    { duration: "5m", target: 50 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    // Acceptance bar: 95% of requests under 500ms, <1% errors.
    http_req_duration: ["p(95)<500"],
    anonymous_failures: ["rate<0.01"],
  },
  // Tag every request so we can slice the Sentry/Axiom trail by scenario.
  tags: { scenario: "01-anonymous" },
};

const ROUTES = [
  { path: "/", weight: 4 }, // marketing landing — heaviest
  { path: "/login", weight: 3 }, // login form, no submit
  { path: "/help", weight: 2 }, // help index
  { path: "/help/getting-started", weight: 1 },
];

// Build a weighted pick array once at module load — k6 calls this per VU.
const PICK = ROUTES.flatMap((r) => Array(r.weight).fill(r.path));

export default function () {
  const path = PICK[Math.floor(Math.random() * PICK.length)];

  group(`GET ${path}`, () => {
    const res = http.get(`${BASE_URL}${path}`, {
      headers: { "user-agent": "rokki-loadtest/01-anonymous" },
      tags: { route: path },
    });
    const ok = check(res, {
      "status 2xx/3xx": (r) => r.status >= 200 && r.status < 400,
      "ttfb < 500ms": (r) => r.timings.waiting < 500,
    });
    failureRate.add(!ok);
  });

  // Pace: 1 req per VU per second. Tighter than human browsing but
  // looser than a stress test — intentionally a sustainable baseline.
  sleep(1);
}
