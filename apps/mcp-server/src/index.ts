/**
 * Rokki MCP server.
 *
 * Speaks the Model Context Protocol over Server-Sent Events so that Claude
 * Desktop, Claude Code, Cursor, and other MCP-compatible clients can read
 * and act on Rokki data scoped to the user's access token.
 *
 * Transport layout (per modelcontextprotocol.io):
 *   GET  /v1/sse           — client opens SSE stream; server emits an "endpoint"
 *                            event naming the POST URL (with a session id).
 *   POST /v1/sse/messages?sid=X
 *                          — client sends JSON-RPC request; response is pushed
 *                            back to the client over the corresponding SSE stream.
 *
 * All routes require a valid Authorization: Bearer rk_... token whose hash
 * matches an unrevoked, unexpired row in access_tokens.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import crypto from "node:crypto";
import { authenticate, type AuthedSession } from "./auth.js";
import { findTool, listTools } from "./tools.js";

const app = new Hono();

interface Session {
  id: string;
  auth: AuthedSession;
  send: (event: string, data: unknown) => Promise<void>;
  close: () => void;
}

const sessions = new Map<string, Session>();

/* -------------------------------------------------------------------------- */
/* Health + diagnostics                                                        */
/* -------------------------------------------------------------------------- */

app.get("/", (c) =>
  c.json({ service: "rokki-mcp", version: "1.0.0", active_sessions: sessions.size }),
);
app.get("/v1/health", (c) => c.json({ ok: true, time: new Date().toISOString() }));

/* -------------------------------------------------------------------------- */
/* SSE: GET /v1/sse — open a session                                          */
/* -------------------------------------------------------------------------- */

app.get("/v1/sse", async (c) => {
  const authHeader = c.req.header("Authorization") ?? c.req.header("authorization");
  const auth = await authenticate(authHeader);
  if (!auth) return c.text("Unauthorized", 401);

  return streamSSE(c, async (stream) => {
    const id = crypto.randomUUID();
    const endpoint = `/v1/sse/messages?sid=${id}`;

    const send = async (event: string, data: unknown) => {
      await stream.writeSSE({
        event,
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
    };

    const close = () => {
      sessions.delete(id);
      try {
        stream.close();
      } catch {
        // already closed
      }
    };

    sessions.set(id, { id, auth, send, close });

    // First event: tell the client where to POST its JSON-RPC messages
    await send("endpoint", endpoint);

    // Keep-alive comments every 20 s so intermediaries don't drop the connection.
    const keepalive = setInterval(() => {
      stream.write(`: keepalive ${Date.now()}\n\n`).catch(() => {});
    }, 20_000);

    c.req.raw.signal.addEventListener("abort", () => {
      clearInterval(keepalive);
      sessions.delete(id);
    });

    // Block until the stream is aborted — Hono awaits the handler.
    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", () => resolve());
    });
    clearInterval(keepalive);
  });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/sse/messages — JSON-RPC request; response over SSE                */
/* -------------------------------------------------------------------------- */

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

app.post("/v1/sse/messages", async (c) => {
  const sid = c.req.query("sid");
  if (!sid) return c.text("missing sid", 400);
  const session = sessions.get(sid);
  if (!session) return c.text("session not found", 404);

  // Re-check auth on every message so revoked tokens disconnect quickly.
  const authHeader = c.req.header("Authorization") ?? c.req.header("authorization");
  const liveAuth = await authenticate(authHeader);
  if (!liveAuth || liveAuth.tokenId !== session.auth.tokenId) {
    session.close();
    return c.text("Unauthorized", 401);
  }

  let req: JsonRpcRequest;
  try {
    req = await c.req.json<JsonRpcRequest>();
  } catch {
    return c.text("invalid json", 400);
  }

  // Process asynchronously; respond 202 to the POST. The response goes via SSE.
  void handleRpc(session, req);
  return c.body(null, 202);
});

async function handleRpc(session: Session, req: JsonRpcRequest) {
  const id = req.id ?? null;

  async function respond(result: unknown) {
    const msg: JsonRpcResponse = { jsonrpc: "2.0", id: id as number | string, result };
    await session.send("message", msg);
  }
  async function fail(code: number, message: string, data?: unknown) {
    const msg: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: id as number | string,
      error: { code, message, data },
    };
    await session.send("message", msg);
  }

  try {
    switch (req.method) {
      case "initialize":
        await respond({
          protocolVersion: "2024-11-05",
          serverInfo: { name: "rokki", version: "1.0.0" },
          capabilities: { tools: {} },
        });
        return;

      case "notifications/initialized":
        // Client ack; no response needed.
        return;

      case "tools/list": {
        const tools = listTools(session.auth).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        await respond({ tools });
        return;
      }

      case "tools/call": {
        const params = (req.params ?? {}) as {
          name?: string;
          arguments?: Record<string, unknown>;
        };
        const name = params.name;
        if (!name) {
          await fail(-32602, "missing tool name");
          return;
        }
        const tool = findTool(name);
        if (!tool) {
          await fail(-32601, `unknown tool: ${name}`);
          return;
        }
        if (tool.requiresWrite && !session.auth.scopes.includes("write")) {
          await fail(-32002, "this tool requires a write-scope token");
          return;
        }
        try {
          const result = await tool.handler(params.arguments ?? {}, session.auth);
          await respond(result);
        } catch (e) {
          await fail(
            -32000,
            e instanceof Error ? e.message : "tool execution failed",
          );
        }
        return;
      }

      case "ping":
        await respond({});
        return;

      default:
        await fail(-32601, `method not found: ${req.method}`);
    }
  } catch (e) {
    console.error("[mcp] unhandled error:", e);
    try {
      await fail(-32000, "internal error");
    } catch {
      // Stream closed; nothing to do.
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

const port = Number(process.env.PORT ?? 3001);
console.log(`[rokki-mcp] listening on :${port}`);
serve({ fetch: app.fetch, port });
