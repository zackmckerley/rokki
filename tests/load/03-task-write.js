// k6 — task write mix
//
// Mix of create + update + complete on a known terminal. Exercises
// the write path that hits both Postgres (insert/update) and Sentry
// tracing in the most realistic way (each request fans into multiple
// `db.query` spans).
//
// Run:
//   K6_BASE_URL=https://staging.rokki.ai \
//   K6_SESSION_COOKIE='sb-...=...; sb-refresh=...' \
//   K6_TICKER=LOAD \
//     k6 run tests/load/03-task-write.js
//
// Setup the staging account so a terminal with ticker $K6_TICKER exists
// and the load-test user has permission to create tasks in it. The
// scenario will leave behind tasks; clean them up between runs (or
// schedule a nightly purge in the load-test space).

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Counter } from "k6/metrics";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE_URL = (__ENV.K6_BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const SESSION_COOKIE = __ENV.K6_SESSION_COOKIE || "";
const TICKER = (__ENV.K6_TICKER || "LOAD").toUpperCase();

if (!SESSION_COOKIE) {
  throw new Error(
    "K6_SESSION_COOKIE is required. Grab the sb-* cookies from a signed-in browser session.",
  );
}

const failureRate = new Rate("task_write_failures");
const tasksCreated = new Counter("tasks_created");

export const options = {
  stages: [
    { duration: "3m", target: 20 },
    { duration: "5m", target: 20 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<1500"],
    task_write_failures: ["rate<0.01"],
  },
  tags: { scenario: "03-task-write" },
};

const HEADERS = {
  cookie: SESSION_COOKIE,
  accept: "application/json",
  "content-type": "application/json",
  "user-agent": "rokki-loadtest/03-task-write",
};

// Per-VU state — we keep IDs of recently-created tasks so we can update
// and complete them in subsequent iterations. Closed-loop: each VU
// creates -> updates -> completes its own task before moving on.
const TASK_PATH = `/api/v1/projects/${TICKER}/tasks`;

export default function () {
  // 1) Create
  let taskId;
  group("POST tasks (create)", () => {
    const body = JSON.stringify({
      title: `loadtest task ${uuidv4().slice(0, 8)}`,
      priority: 3,
    });
    const res = http.post(`${BASE_URL}${TASK_PATH}`, body, {
      headers: HEADERS,
      tags: { route: TASK_PATH, op: "create" },
    });
    const ok = check(res, {
      "201 created": (r) => r.status === 201,
    });
    failureRate.add(!ok);
    if (ok) {
      try {
        const parsed = JSON.parse(res.body);
        taskId = parsed?.data?.id;
        tasksCreated.add(1);
      } catch {
        failureRate.add(1);
      }
    }
  });
  if (!taskId) {
    sleep(1);
    return;
  }

  sleep(0.3);

  // 2) Update title/priority
  group("PATCH tasks/:id (update)", () => {
    const res = http.patch(
      `${BASE_URL}/api/v1/tasks/${taskId}`,
      JSON.stringify({
        priority: 2,
        description: "edited under load",
      }),
      { headers: HEADERS, tags: { route: "/api/v1/tasks/:id", op: "update" } },
    );
    failureRate.add(!check(res, { "200 ok": (r) => r.status === 200 || r.status === 204 }));
  });

  sleep(0.3);

  // 3) Complete
  group("POST tasks/:id/complete", () => {
    const res = http.post(
      `${BASE_URL}/api/v1/tasks/${taskId}/complete`,
      "{}",
      {
        headers: HEADERS,
        tags: { route: "/api/v1/tasks/:id/complete", op: "complete" },
      },
    );
    failureRate.add(
      !check(res, { "2xx": (r) => r.status >= 200 && r.status < 300 }),
    );
  });

  sleep(1);
}
