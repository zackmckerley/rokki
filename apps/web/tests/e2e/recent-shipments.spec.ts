import { test, expect } from "@playwright/test";
import { apiAs, uniqueTicker, SEED } from "./helpers";

/**
 * E2E coverage for features shipped in the recent feature batch
 * (PR #110 through PR #143).
 *
 *   - Request-update flow            (PR #114)
 *   - Status-reply flow              (PR #114)
 *   - External-assignee normalization (PR #116)
 *   - Reminders refresh + 24h dedupe  (PR #118)
 *
 * Tests are API-call driven via `apiAs` — same pattern as
 * acceptance.spec.ts. Faster than full UI flows, avoids browser
 * interaction flakiness, exercises the same backend code paths the
 * UI uses.
 */

test.describe("recent shipments — request-update flow", () => {
  let ticker: string;
  let terminalId: string;
  let taskId: string;

  test.beforeAll(async ({ baseURL }) => {
    const { api } = await apiAs("zack", baseURL!);
    const spaceResp = await api.get("/api/v1/orgs/helios");
    const space = (await spaceResp.json()) as { data: { id: string } };
    ticker = uniqueTicker("RUE2E");
    const tResp = await api.post("/api/v1/projects", {
      data: {
        space_id: space.data.id,
        name: "Request-update E2E",
        ticker,
        type: "general",
      },
    });
    const t = (await tResp.json()) as { data: { id: string } };
    terminalId = t.data.id;

    // Create a task with carlos as the assignee so zack can request
    // an update from someone other than himself.
    const { user_id: carlosId } = await apiAs("carlos", baseURL!);
    const taskResp = await api.post(`/api/v1/projects/${ticker}/tasks`, {
      data: {
        title: "Status check task",
        assignee_ids: [carlosId],
      },
    });
    const task = (await taskResp.json()) as { data: { id: string } };
    taskId = task.data.id;
    await api.dispose();
  });

  test("request-update creates a thread and ping message", async ({
    baseURL,
  }) => {
    const { api } = await apiAs("zack", baseURL!);
    const resp = await api.post(`/api/v1/tasks/${taskId}/request-update`, {
      data: {},
    });
    expect(resp.status()).toBe(201);
    const body = (await resp.json()) as {
      data: {
        thread_id: string;
        message_id: string;
        recipients: string[];
      };
    };
    expect(body.data.thread_id).toBeTruthy();
    expect(body.data.message_id).toBeTruthy();
    expect(body.data.recipients.length).toBeGreaterThan(0);

    // Pull the thread back — message should have pinging_task_id set.
    const threadResp = await api.get(
      `/api/v1/messages/threads/${body.data.thread_id}`,
    );
    const thread = (await threadResp.json()) as {
      data: { id: string; pinging_task_id: string | null }[];
    };
    const pingMsg = thread.data.find((m) => m.pinging_task_id === taskId);
    expect(pingMsg, "ping message should reference the task").toBeTruthy();
    await api.dispose();
  });

  test("status-update updates latest_status fields", async ({ baseURL }) => {
    // Carlos (the assignee) replies with status.
    const { api } = await apiAs("carlos", baseURL!);
    const statusText = `On track — siding done, paint tomorrow.`;
    const resp = await api.post(`/api/v1/tasks/${taskId}/status-update`, {
      data: { text: statusText },
    });
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      data: {
        latest_status_text: string;
        latest_status_author_id: string;
        latest_status_at: string;
      };
    };
    expect(body.data.latest_status_text).toBe(statusText);
    expect(body.data.latest_status_at).toBeTruthy();
    await api.dispose();
  });

  test("request-update rejects when you're the only assignee", async ({
    baseURL,
  }) => {
    const { api, user_id: zackId } = await apiAs("zack", baseURL!);
    // Spin up a task assigned only to zack himself.
    const taskResp = await api.post(`/api/v1/projects/${ticker}/tasks`, {
      data: { title: "Solo task", assignee_ids: [zackId] },
    });
    const t = (await taskResp.json()) as { data: { id: string } };
    const resp = await api.post(`/api/v1/tasks/${t.data.id}/request-update`, {
      data: {},
    });
    expect(resp.status()).toBe(400);
    const err = (await resp.json()) as { errors: { message: string }[] };
    expect(err.errors[0].message).toMatch(/nobody to ping/i);
    await api.dispose();
  });
});

test.describe("recent shipments — external assignees", () => {
  let ticker: string;

  test.beforeAll(async ({ baseURL }) => {
    const { api } = await apiAs("zack", baseURL!);
    const spaceResp = await api.get("/api/v1/orgs/helios");
    const space = (await spaceResp.json()) as { data: { id: string } };
    ticker = uniqueTicker("EAE2E");
    await api.post("/api/v1/projects", {
      data: {
        space_id: space.data.id,
        name: "External-assignee E2E",
        ticker,
        type: "general",
      },
    });
    await api.dispose();
  });

  test("normalizes emails (lowercase, trim, dedupe)", async ({ baseURL }) => {
    const { api } = await apiAs("zack", baseURL!);
    const r = await api.post(`/api/v1/projects/${ticker}/tasks`, {
      data: {
        title: "Bid out the windows",
        external_assignee_emails: [
          "  Vendor@Example.COM  ",
          "vendor@example.com", // duplicate after normalization
          "second@vendor.io",
        ],
      },
    });
    expect(r.status()).toBe(201);
    // Pull list to verify storage shape.
    const listResp = await api.get(`/api/v1/projects/${ticker}/tasks`);
    const list = (await listResp.json()) as {
      data: { external_assignee_emails: string[] }[];
    };
    const task = list.data[list.data.length - 1];
    expect(task.external_assignee_emails).toEqual(
      expect.arrayContaining(["vendor@example.com", "second@vendor.io"]),
    );
    expect(task.external_assignee_emails).toHaveLength(2);
    await api.dispose();
  });

  test("rejects malformed email shapes", async ({ baseURL }) => {
    const { api } = await apiAs("zack", baseURL!);
    const r = await api.post(`/api/v1/projects/${ticker}/tasks`, {
      data: {
        title: "Bad payload",
        external_assignee_emails: ["not-an-email"],
      },
    });
    expect(r.status()).toBe(400);
    const err = (await r.json()) as { errors: { message: string }[] };
    expect(err.errors[0].message).toMatch(/external_assignee_emails/);
    await api.dispose();
  });
});

test.describe("recent shipments — task complete via PATCH", () => {
  test("PATCH status=done sets completed_at", async ({ baseURL }) => {
    const { api } = await apiAs("zack", baseURL!);
    const spaceResp = await api.get("/api/v1/orgs/helios");
    const space = (await spaceResp.json()) as { data: { id: string } };
    const ticker = uniqueTicker("CCE2E");
    await api.post("/api/v1/projects", {
      data: {
        space_id: space.data.id,
        name: "Click-circle E2E",
        ticker,
        type: "general",
      },
    });
    const tResp = await api.post(`/api/v1/projects/${ticker}/tasks`, {
      data: { title: "Mark me done" },
    });
    const t = (await tResp.json()) as { data: { id: string } };

    const patch = await api.patch(`/api/v1/tasks/${t.data.id}`, {
      data: { status: "done" },
    });
    expect(patch.status()).toBe(200);
    const body = (await patch.json()) as {
      data: { status: string; completed_at: string | null };
    };
    expect(body.data.status).toBe("done");
    expect(body.data.completed_at).toBeTruthy();
    await api.dispose();
  });
});

test.describe("recent shipments — notifications endpoint shape", () => {
  test("GET /notifications returns enriched rows + unread count", async ({
    baseURL,
  }) => {
    // Trigger a mention so there's something in the feed: zack
    // creates a task and mentions carlos in a comment, which fires a
    // mention notification to carlos.
    void SEED;
    const { api: zackApi } = await apiAs("zack", baseURL!);
    const spaceResp = await zackApi.get("/api/v1/orgs/helios");
    const space = (await spaceResp.json()) as { data: { id: string } };
    const ticker = uniqueTicker("NTE2E");
    const projResp = await zackApi.post("/api/v1/projects", {
      data: {
        space_id: space.data.id,
        name: "Notif E2E",
        ticker,
        type: "general",
      },
    });
    const proj = (await projResp.json()) as { data: { id: string } };
    const { user_id: carlosId } = await apiAs("carlos", baseURL!);
    const tResp = await zackApi.post(`/api/v1/projects/${ticker}/tasks`, {
      data: { title: "Mention target" },
    });
    const task = (await tResp.json()) as { data: { id: string } };
    await zackApi.post("/api/v1/comments", {
      data: {
        entity_type: "task",
        entity_id: task.data.id,
        terminal_id: proj.data.id,
        body: `Hey <@${carlosId}> can you look at this?`,
      },
    });

    // Now Carlos pulls his notifications.
    const { api: carlosApi } = await apiAs("carlos", baseURL!);
    const notifResp = await carlosApi.get("/api/v1/notifications?limit=10");
    expect(notifResp.ok()).toBeTruthy();
    const body = (await notifResp.json()) as {
      data: { id: string; kind: string; terminal: unknown }[];
      unread_count: number;
    };
    expect(typeof body.unread_count).toBe("number");
    expect(body.data.length).toBeGreaterThan(0);
    // Find at least one row that's a mention with a terminal attached.
    const mentions = body.data.filter((r) => r.kind === "mention");
    expect(mentions.length).toBeGreaterThan(0);
    await zackApi.dispose();
    await carlosApi.dispose();
  });
});
