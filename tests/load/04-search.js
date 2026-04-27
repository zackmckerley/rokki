// k6 — search endpoint load
//
// Mix of 1-3 word queries, common stopwords, and longer "type-along"
// strings to mimic the command palette's incremental search. The
// `/api/v1/search` route is currently a thin terminals filter (Phase 1)
// but will fan into tasks + files + tools soon — this scenario is
// intentionally written to keep working as the implementation grows.
//
// DEPENDENCY: this scenario assumes the `/api/v1/search` route exists.
// On branches that haven't merged the search-and-views work yet it
// returns 404 across the board; the scenario detects that case and
// fails loud rather than silently passing.
//
// Run:
//   K6_BASE_URL=https://staging.rokki.ai \
//   K6_SESSION_COOKIE='sb-...=...; sb-refresh=...' \
//     k6 run tests/load/04-search.js

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = (__ENV.K6_BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const SESSION_COOKIE = __ENV.K6_SESSION_COOKIE || "";

if (!SESSION_COOKIE) {
  throw new Error(
    "K6_SESSION_COOKIE is required. Grab the sb-* cookies from a signed-in browser session.",
  );
}

const failureRate = new Rate("search_failures");
const notFoundRate = new Rate("search_route_missing");

export const options = {
  stages: [
    { duration: "3m", target: 40 },
    { duration: "5m", target: 40 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    search_failures: ["rate<0.02"],
    // Hard-fail if the route is missing from this branch — beats
    // silently passing because every 404 is "fast".
    search_route_missing: ["rate<0.001"],
  },
  tags: { scenario: "04-search" },
};

const HEADERS = {
  cookie: SESSION_COOKIE,
  accept: "application/json",
  "user-agent": "rokki-loadtest/04-search",
};

// A range of query shapes. Distribution is hand-tuned:
//   - 1-2 short words = the bulk of real palette traffic
//   - common stopword = worst case for the lexer
//   - longer phrase = simulates a user who pasted in a sentence
const QUERIES = [
  "task",
  "the",
  "and",
  "alpha",
  "beta",
  "design review",
  "open invoice",
  "permit due",
  "weekly status report",
  "drawings revision pending architectural",
  "a",
  "schedule",
  "owner",
  "vendor list",
  "files",
];

export default function () {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const path = `/api/v1/search?q=${encodeURIComponent(q)}`;

  group("GET /api/v1/search", () => {
    const res = http.get(`${BASE_URL}${path}`, {
      headers: HEADERS,
      tags: { route: "/api/v1/search", q_words: String(q.split(/\s+/).length) },
    });
    if (res.status === 404) {
      notFoundRate.add(1);
      // Don't double-count as a generic failure — the dedicated metric
      // is what trips the threshold.
      return;
    }
    notFoundRate.add(0);
    const ok = check(res, {
      "200 ok": (r) => r.status === 200,
      "json body": (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      "ttfb < 1000ms": (r) => r.timings.waiting < 1000,
    });
    failureRate.add(!ok);
  });

  sleep(0.5);
}
