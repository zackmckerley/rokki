# 03 — MCP Server

**Scope:** How the Rokki MCP server exposes the platform to external LLM clients (Claude, ChatGPT, Gemini, etc.). Protocol details, tool definitions, sampling flow, and authentication.

## 3.1 What MCP is

[Model Context Protocol](https://modelcontextprotocol.io) is a standard protocol (introduced by Anthropic, adopted by multiple LLM vendors) for connecting LLMs to external data sources and tools. An MCP server exposes *tools* (functions the LLM can call), *resources* (data the LLM can read), and *prompts* (reusable templates). LLM clients connect to MCP servers via stdio (local) or HTTP+SSE (remote).

Rokki uses **remote MCP** — a single hosted endpoint (`mcp.rokki.ai`) that any MCP-compatible client can connect to with a user's access token.

## 3.2 Transport

- **URL:** `https://mcp.rokki.ai/v1/sse`
- **Protocol:** HTTP + Server-Sent Events (bidirectional via two streams)
- **Auth:** `Authorization: Bearer <rokki_access_token>` header (token from §02.15)
- **Keep-alive:** ping every 30s
- **Session timeout:** 10 minutes of inactivity

The implementation uses the official `@modelcontextprotocol/sdk` Node package with the SSE transport. Session state is held in memory on the MCP server and includes: user_id, token_id, token scopes, project_restrictions.

## 3.3 Capabilities advertised

On `initialize`, the server advertises:

```json
{
  "protocolVersion": "2024-11-05",
  "serverInfo": { "name": "rokki", "version": "1.0.0" },
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": true, "listChanged": true },
    "prompts": {},
    "sampling": {}
  }
}
```

- `tools.listChanged` → notify client when user's accessible tools change (e.g., admin granted access to a new tool mid-session)
- `resources.subscribe` → clients can subscribe to specific resources (e.g., a task) for updates
- `sampling` → server may request the client to run LLM inference on its behalf

## 3.4 Built-in tools

These are the platform's own tools — always present, scoped by the caller's token and RLS.

### 3.4.1 `rokki_list_projects`

**Description:** *"List all projects the user has access to, across all their orgs."*

**Inputs:**
```json
{
  "type": "object",
  "properties": {
    "org": { "type": "string", "description": "Filter by org slug. Omit to list across all orgs." },
    "status": { "type": "string", "enum": ["planning", "active", "blocked", "done", "archived"] },
    "limit": { "type": "integer", "default": 50, "maximum": 200 }
  }
}
```

**Output:**
```json
{
  "projects": [
    {
      "ticker": "BRKL",
      "org_slug": "helios",
      "name": "123 Brickell Renovation",
      "status": "active",
      "role": "owner",
      "last_activity": "2026-04-19T14:20:00Z"
    }
  ]
}
```

### 3.4.2 `rokki_get_project`

**Description:** *"Get full details for a single project by its ticker (e.g., BRKL)."*

**Inputs:**
```json
{
  "type": "object",
  "properties": {
    "ticker": { "type": "string" },
    "org": { "type": "string", "description": "Required only if ticker is ambiguous across orgs." }
  },
  "required": ["ticker"]
}
```

**Output:** Full project object with member list, file count, task counts by status, recent activity snippet.

### 3.4.3 `rokki_list_tasks`

**Description:** *"List tasks in a project with optional filters. Use this to answer questions like 'what's overdue' or 'what am I working on'."*

**Inputs:**
```json
{
  "type": "object",
  "properties": {
    "ticker": { "type": "string" },
    "status": { "type": "string", "enum": ["todo", "in_progress", "blocked", "review", "done"] },
    "assignee": { "type": "string", "description": "User ID, 'me', or email." },
    "due_before": { "type": "string", "format": "date" },
    "priority": { "type": "integer", "minimum": 1, "maximum": 4 },
    "limit": { "type": "integer", "default": 50, "maximum": 200 }
  },
  "required": ["ticker"]
}
```

**Output:** Array of task summaries `{id, ticker_seq, title, status, priority, due_date, assignees: [{id, name}]}`.

### 3.4.4 `rokki_get_task`

**Description:** *"Get full details for a single task including description, comments, and activity."*

**Inputs:** `{ ticker: string, seq: integer }` or `{ task_id: string }`

### 3.4.5 `rokki_create_task`

**Description:** *"Create a new task in a project. Use when the user asks you to add something to their to-do list or assign work."*

**Inputs:**
```json
{
  "ticker": "BRKL",
  "title": "Order impact windows",
  "description": "Optional markdown",
  "assignee_emails": ["carlos@arch.co"],
  "due_date": "2026-05-01",
  "priority": 2,
  "labels": ["procurement"]
}
```

**Output:** The created task (including generated `ticker_seq`).

**Write scope required.** Returns 403/denied if token is read-only.

### 3.4.6 `rokki_update_task`

**Description:** *"Update an existing task — change status, priority, due date, description, assignees."*

**Inputs:** `{ task_id, patch: { status?, title?, ... } }`

### 3.4.7 `rokki_complete_task`

**Description:** *"Mark a task as done."*

### 3.4.8 `rokki_list_files`

**Description:** *"List files in a project, filterable by folder and file type."*

**Inputs:** `{ ticker, folder?, mime_type? }`

Returns only files the caller has visibility for.

### 3.4.9 `rokki_read_file`

**Description:** *"Read the content of a file. For large files (PDFs, docs), returns the most relevant excerpts based on the optional `query` parameter. For small text files, returns the full content."*

**Inputs:**
```json
{
  "file_id": "uuid",
  "query": "Optional: what are you looking for? Used for semantic excerpt selection on large files.",
  "max_tokens": { "type": "integer", "default": 4000, "maximum": 20000 }
}
```

**Output:**
```json
{
  "file": { "id", "filename", "mime_type", "size_bytes" },
  "excerpts": [
    { "content": "...", "page": 3, "relevance": 0.92 }
  ],
  "truncated": false
}
```

Uses RAG pipeline from §05. For files < 10KB, returns full content. For larger files, returns top-k chunks by cosine similarity to `query` (or the first chunks if no query).

### 3.4.10 `rokki_upload_file`

**Description:** *"Upload a file to a project. For files under 5MB, pass content inline. For larger files, get a signed URL first."*

**Inputs (small):**
```json
{
  "ticker": "BRKL",
  "filename": "permit.pdf",
  "folder": "/permits",
  "content_base64": "...",
  "visibility": "project",
  "metadata": { "revision": 3 }
}
```

**Inputs (large):** `{ ticker, filename, size_bytes, mime_type }` → returns `{ upload_url, upload_id }`; client (or user) uploads directly, then calls `rokki_finalize_upload`.

### 3.4.11 `rokki_search_project`

**Description:** *"Search across files, tasks, and comments in a project using natural language. Returns ranked results with citations."*

**Inputs:** `{ ticker, query, types?: ["files", "tasks", "comments"] }`

**Output:**
```json
{
  "results": [
    { "type": "file_chunk", "file_id": "...", "filename": "A-102.pdf", "page": 3, "excerpt": "...", "score": 0.91 },
    { "type": "task", "task_id": "...", "title": "...", "score": 0.78 }
  ]
}
```

### 3.4.12 `rokki_ask_project`

**Description:** *"Ask a natural-language question about a project. Performs RAG over project documents and returns an answer with citations. Prefer this for open-ended questions over `rokki_search_project` + manual synthesis."*

**Inputs:** `{ ticker, question }`

**Output:**
```json
{
  "answer": "The ceilings are 9'-0\" throughout, with 10'-0\" in living areas.",
  "sources": [
    { "file_id": "...", "filename": "A-102.pdf", "page": 3 }
  ]
}
```

**Implementation:** internally uses MCP sampling (§3.6) to generate the answer, so no BYOK is required unless the user's client doesn't support sampling.

### 3.4.13 `rokki_list_members`, `rokki_invite`, `rokki_get_member`

Project and org member management. `rokki_invite` requires write scope.

### 3.4.14 `rokki_list_activity`

**Description:** *"Get recent activity in a project or across all your projects. Use for questions like 'what happened today'."*

### 3.4.15 `rokki_list_tools` (dynamic)

Lists available custom tools for the caller. But these are also registered as individual MCP tools (see §3.5) — `rokki_list_tools` is for catalog browsing.

## 3.5 Dynamic user tools

Every tool the user has access to (via `tool_access` rows or visibility) is registered as an MCP tool at session init, with its slug as the tool name.

Example: if the user has access to `aerial-reels`, the MCP client sees a tool named `aerial_reels` (underscores replace dashes for MCP compatibility) alongside the built-in tools.

The tool's MCP definition is generated from the tool's `input_schema` (already JSON Schema Draft 2020-12, directly usable). The description is the tool's `description` field, optionally suffixed with cost info:

```
"Generate aerial video of a property from an address. (costs ~5 credits per use)"
```

When the LLM calls a user tool, the MCP server:
1. Validates the caller's access (tool visibility + `tool_access`)
2. Enforces quotas (§06)
3. Checks approval requirement (§06)
4. If auto-approved and under quota: dispatches to tool executor
5. Otherwise: returns `{ "status": "approval_required" | "quota_exceeded" }`

Execution detail is in §06.

When a user's tool access changes mid-session (admin grants/revokes), the server emits `notifications/tools/list_changed` → client re-calls `tools/list`.

## 3.6 Sampling (server → client LLM)

MCP sampling lets the server ask the client's LLM to generate text. Rokki uses this for tools that need LLM inference without requiring the user to configure BYOK API keys.

**Example: `rokki_ask_project`**

1. User: *"What's the ceiling height on Brickell?"*
2. Client's Claude calls `rokki_ask_project({ticker: "BRKL", question: "ceiling height"})`.
3. Rokki server runs RAG: semantic search over `file_chunks` in BRKL, pulls top 5 excerpts.
4. Rokki server calls MCP `sampling/createMessage` back to the client with:
   ```json
   {
     "messages": [
       { "role": "user", "content": "Answer the user's question using ONLY these sources. Question: ceiling height. Sources: [excerpts]. Include [source:filename:page] citations." }
     ],
     "maxTokens": 1000,
     "temperature": 0.1,
     "systemPrompt": "You are a concise project assistant. Answer from sources only."
   }
   ```
5. Client's Claude (the user's own subscription) generates the answer.
6. Rokki server returns the answer to the tool call.

**Client auto-approval:** the `sampling/createMessage` spec allows the client to auto-approve based on user settings. Claude Desktop offers a per-server "auto-approve sampling" toggle. On first use, the client prompts the user.

**Fallback logic when sampling is unavailable:**

1. Check if user has BYOK for any compatible provider → use it.
2. Check if tool has platform fallback enabled and user is under quota → use platform key.
3. Return error with code `sampling_unavailable` and instructions:
   ```json
   {
     "error": "This tool needs LLM inference. Your client doesn't support sampling. Please connect an Anthropic or OpenAI key in rokki.ai/settings/keys, or use Claude Desktop which supports sampling."
   }
   ```

## 3.7 Resources

MCP resources are URIs the client can read. Rokki exposes:

```
rokki://projects/<ticker>              → project overview (JSON)
rokki://projects/<ticker>/files/<id>   → file metadata + excerpt
rokki://projects/<ticker>/tasks/<seq>  → task detail
rokki://users/me                       → current user + orgs
```

Resources are read-only. For mutations, clients call tools.

Resource subscriptions: client can subscribe to `rokki://projects/<ticker>/tasks` to receive live updates when tasks change. Server sends `notifications/resources/updated` events.

## 3.8 Prompts

MCP prompts are reusable templates the client UI can surface. Rokki exposes:

- `brief_me` — *"Give me a brief of [project]: status, what's overdue, what needs my attention."*
- `weekly_update` — *"Draft a weekly client update for [project]."*
- `prioritize_my_day` — *"Look at everything across my projects. Tell me what to work on today."*

Prompts take arguments. When invoked, the prompt populates the user's chat with the filled template — the LLM then runs with it.

## 3.9 Authentication

Every MCP connection:

1. Client sends `Authorization: Bearer rk_live_...`
2. Server looks up token by `sha256(token)` in `access_tokens`
3. Validates: not revoked, not expired, scopes include at least `read`
4. Loads the associated user's profile + org memberships
5. Establishes session with `token_id`, `user_id`, `scopes`, `project_restrictions`

**Every tool call logs `actor_token_id` in activity** — you can trace back every AI-initiated action to the specific token.

**Write scope (`write`):** required for mutating tools (create task, upload file, etc.). Read-only tokens can still read everything.

**Admin scope (`admin`):** required for admin tools (not yet exposed via MCP; Phase 2).

**Project restrictions:** if set on the token, the MCP server filters ALL tools to only the listed projects. Even read tools hide other projects.

## 3.10 Activity logging

Every MCP tool call writes to `activity`:

```sql
INSERT INTO activity (project_id, actor_id, actor_token_id, action, entity_type, entity_id, metadata)
VALUES ($project_id, $user_id, $token_id, $action, $entity_type, $entity_id, $meta);
```

Failed tool calls also log (with `metadata.error`). Activity is immutable (§01.7.10).

## 3.11 Error codes

MCP errors use JSON-RPC error objects. Rokki-specific codes:

| code | Meaning |
|---|---|
| -32001 | `unauthenticated` — token invalid |
| -32002 | `forbidden` — scope or permission insufficient |
| -32003 | `quota_exceeded` |
| -32004 | `approval_required` |
| -32005 | `rate_limited` |
| -32006 | `sampling_unavailable` |
| -32007 | `tool_not_found` |
| -32008 | `invalid_input` — schema validation failed |
| -32009 | `upstream_error` — Azure / Anthropic API failed |

Errors include a `data` field with a `retry_strategy` when applicable.

## 3.12 Rate limits

Per-token:

| Call type | Limit |
|---|---|
| Read tools (list, get, search) | 600/min |
| Write tools (create, update, upload) | 120/min |
| Tool invocations | Per-tool rate limit applied to sum across all callers |
| Sampling | Passed through to client — no server limit |

Exceeded → error `-32005` with `Retry-After` in `data.retry_after_seconds`.

## 3.13 Client setup instructions

End-user-facing instructions shown on `app.rokki.ai/settings/tokens`:

**Claude Desktop:**
```json
{
  "mcpServers": {
    "rokki": {
      "transport": "sse",
      "url": "https://mcp.rokki.ai/v1/sse",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

**Claude Code CLI:**
```
claude mcp add rokki --transport sse --url https://mcp.rokki.ai/v1/sse --header "Authorization: Bearer YOUR_TOKEN_HERE"
```

**ChatGPT (custom GPT):** upload the OpenAPI spec from `docs.rokki.ai/openapi.json` as an Action, set auth to "Bearer" with the token.

**Cursor / Windsurf / Zed:** settings vary; pattern is same (SSE URL + Authorization header).

## 3.14 Server implementation notes

- **Runtime:** Node 20, TypeScript
- **SDK:** `@modelcontextprotocol/sdk` (server package) for protocol handling
- **DB access:** Supabase client configured with the user's JWT derived from their Rokki token (via a server-side exchange endpoint) so RLS applies as if the user were logged in
- **Tool dispatch:** user tools call into the tool executor service (§06) over internal RPC (gRPC or plain HTTPS on private network)
- **State:** in-memory session map; no durability needed — client reconnects re-establish
- **Horizontal scaling:** stateless per-request apart from active SSE connections. Scale with connection affinity (sticky sessions on the load balancer).
- **Deployment:** Azure Container App (or Fly.io for Phase 1 simplicity), behind Cloudflare

## 3.15 Common pitfalls

- **Do NOT use the Supabase service role key in the MCP server for user-initiated operations.** Always construct a user-scoped client so RLS enforces permissions. The service role is only for writing to activity (which is locked to service role by policy) and decrementing quotas.
- **Token lookup must use `sha256(plaintext)` comparison on `token_hash`.** Do not store or log the plaintext.
- **Tool descriptions are the LLM's only hint about when to use a tool.** Keep them specific and action-oriented. Bad: *"Tool for projects."* Good: *"Create a new task in a project. Use when the user asks you to add something to their to-do list."*
- **MCP sampling requires client support.** Not all clients implement it yet. Always check capabilities on `initialize`; fall back gracefully.
- **`listChanged` notifications** must be sent when a user's tool access changes. Wire this into the approval flow and admin tool-grant endpoints (§06).
- **Dynamic tool names must be MCP-compatible** — alphanumeric + underscore. Convert `aerial-reels` → `aerial_reels` on registration; store the mapping so inputs can resolve back to the tool's slug.
- **Streaming tool outputs (for long-running tools):** MCP does not natively stream tool results. For long tools, return an invocation_id and provide a `rokki_get_invocation(id)` tool the LLM can poll, or use resources with subscriptions.
- **Project restrictions on tokens are enforced at tool dispatch,** not just at tool discovery. A restricted token that somehow receives an unrestricted tool call must still be blocked.
- **Activity writes happen after the tool dispatch completes** — writing before means a crash during dispatch loses the log. Use a background worker or ensure the activity write is retried.
- **The MCP server and API server share a database but deploy separately.** Schema migrations run once; each service adapts to the current schema.
