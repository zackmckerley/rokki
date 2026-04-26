// k6 — realtime presence connections
//
// Open and hold N concurrent WebSocket connections to the Supabase
// Realtime endpoint, joining a single test terminal's presence channel.
// Validates that the realtime broker (Supabase-managed) and our
// frontend's connection-keepalive behaviour both survive a flock of
// idle subscribers.
//
// This is a connection-count test, not a throughput test. We're not
// pushing high message rates — we're checking that 100 simultaneous
// presence subscribers don't trip rate limits or eat all the broker's
// per-channel slots.
//
// Run:
//   K6_BASE_URL=https://staging.rokki.ai \
//   K6_SUPABASE_URL=https://your-project.supabase.co \
//   K6_SUPABASE_ANON_KEY=eyJ... \
//   K6_ACCESS_TOKEN=eyJ... \
//   K6_PRESENCE_CHANNEL=presence:01HXXXXXXXX \
//     k6 run tests/load/05-realtime.js
//
// Get K6_ACCESS_TOKEN by signing in as the load-test user and copying
// the access_token from the sb-* cookies' refresh response, OR call
// the Supabase auth REST endpoint directly. The presence channel name
// follows the format used in TeamPane.tsx: `presence:<terminal-id>`.

import ws from "k6/ws";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const SUPABASE_URL = (__ENV.K6_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = __ENV.K6_SUPABASE_ANON_KEY || "";
const ACCESS_TOKEN = __ENV.K6_ACCESS_TOKEN || "";
const PRESENCE_CHANNEL = __ENV.K6_PRESENCE_CHANNEL || "presence:loadtest";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ACCESS_TOKEN) {
  throw new Error(
    "K6_SUPABASE_URL, K6_SUPABASE_ANON_KEY, and K6_ACCESS_TOKEN are all required for realtime load.",
  );
}

const connectErrors = new Counter("ws_connect_errors");
const subscribeAcks = new Counter("ws_subscribe_acks");
const connectTime = new Trend("ws_connect_ms", true);
const subscribeRate = new Rate("ws_subscribe_success");

export const options = {
  // Closed-loop: every VU holds exactly one open connection for 5min,
  // so 100 VUs == 100 simultaneous connections.
  scenarios: {
    realtime_presence: {
      executor: "constant-vus",
      vus: 100,
      duration: "5m",
    },
  },
  thresholds: {
    ws_connect_errors: ["count<5"],
    ws_subscribe_success: ["rate>0.99"],
    ws_connect_ms: ["p(95)<1500"],
  },
  tags: { scenario: "05-realtime" },
};

// Supabase realtime websocket URL pattern. The `apikey` param + Bearer
// access_token in the join payload is the standard browser handshake.
const WS_URL = `${SUPABASE_URL.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

export default function () {
  const startedAt = Date.now();
  const params = { tags: { channel: PRESENCE_CHANNEL } };

  const res = ws.connect(WS_URL, params, function (socket) {
    let joinRef = 1;
    const userId = `loadtest-${__VU}-${__ITER}`;

    socket.on("open", () => {
      connectTime.add(Date.now() - startedAt);

      // Phoenix-style join. Supabase Realtime speaks Phoenix protocol;
      // the access_token is sent inside the join payload, not as a
      // header (browsers can't set custom WS headers).
      socket.send(
        JSON.stringify({
          topic: `realtime:${PRESENCE_CHANNEL}`,
          event: "phx_join",
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: userId },
              postgres_changes: [],
            },
            access_token: ACCESS_TOKEN,
          },
          ref: String(joinRef++),
        }),
      );

      // Heartbeat every 25s — Supabase closes idle channels after 30s.
      socket.setInterval(() => {
        socket.send(
          JSON.stringify({
            topic: "phoenix",
            event: "heartbeat",
            payload: {},
            ref: String(joinRef++),
          }),
        );
      }, 25_000);

      // Hold the connection for ~5min. close() at the end so we count
      // it as a clean teardown, not an abort.
      socket.setTimeout(() => socket.close(), 5 * 60 * 1000 - 1000);
    });

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.event === "phx_reply" && msg.payload?.status === "ok") {
          subscribeAcks.add(1);
          subscribeRate.add(1);
        } else if (
          msg.event === "phx_reply" &&
          msg.payload?.status === "error"
        ) {
          subscribeRate.add(0);
        }
      } catch {
        // ignore — heartbeat acks etc.
      }
    });

    socket.on("error", () => {
      connectErrors.add(1);
    });
  });

  check(res, { "ws connection established": (r) => r && r.status === 101 });
}
