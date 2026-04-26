// k6 — authenticated dashboard load
//
// Exercises the read paths the dashboard hits on first load. All three
// endpoints are RLS-filtered and small; the goal is to verify Postgres
// connection pooling and Sentry tracing overhead don't choke under
// realistic concurrent reads.
//
// Run:
//   K6_BASE_URL=https://staging.rokki.ai \
//   K6_SESSION_COOKIE='sb-...=...; sb-refresh=...' \
//     k6 run tests/load/02-authed-dashboard.js
//
// Capture the cookie string from a real signed-in browser session
// (Application -> Cookies -> the sb-* cookies). Use a load-test
// account with realistic but bounded data — not your platform-admin
// account.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = (__ENV.K6_BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const SESSION_COOKIE = __ENV.K6_SESSION_COOKIE || "";

if (!SESSION_COOKIE) {
  // Fail fast at script start rather than 0% pass rate at the end.
  // k6 honours `throw` from the init context.
  throw new Error(
    "K6_SESSION_COOKIE is required. Grab the sb-* cookies from a signed-in browser session.",
  );
}

const failureRate = new Rate("authed_failures");

export const options = {
  stages: [
    { duration: "3m", target: 30 },
    { duration: "5m", target: 30 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<800"],
    authed_failures: ["rate<0.01"],
  },
  tags: { scenario: "02-authed-dashboard" },
};

// /api/v1/spaces and /api/v1/terminals are listed in docs/02_API.md but
// the route handlers haven't been split off /api/v1/projects yet — so
// this scenario only hits what exists today. Add the new routes to the
// list once they ship; the relative weights below are tuned for the
// dashboard's real fan-out (4 project-shaped reads per 1 profile read).
const ENDPOINTS = [
  { path: "/api/v1/me", weight: 1 },
  { path: "/api/v1/projects", weight: 4 },
  { path: "/api/v1/orgs", weight: 2 },
];

const PICK = ENDPOINTS.flatMap((e) => Array(e.weight).fill(e.path));

const HEADERS = {
  cookie: SESSION_COOKIE,
  accept: "application/json",
  "user-agent": "rokki-loadtest/02-authed-dashboard",
};

export default function () {
  const path = PICK[Math.floor(Math.random() * PICK.length)];

  group(`GET ${path}`, () => {
    const res = http.get(`${BASE_URL}${path}`, {
      headers: HEADERS,
      tags: { route: path },
    });
    const ok = check(res, {
      "status 200": (r) => r.status === 200,
      "json body": (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      "ttfb < 800ms": (r) => r.timings.waiting < 800,
    });
    failureRate.add(!ok);
  });

  sleep(1);
}
