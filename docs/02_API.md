# 02 — REST API

**Scope:** Every HTTP endpoint exposed by Rokki — request shapes, response shapes, error codes, auth requirements, rate limits.

The OpenAPI 3.1 spec auto-generated from this doc is the machine-readable source of truth and is served at `https://docs.rokki.ai/openapi.json`.

## 2.1 Base conventions

- **Base URL:** `https://api.rokki.ai/v1`
- **Protocol:** HTTPS only (TLS 1.3)
- **Content type:** `application/json` in and out (unless otherwise noted — file uploads use multipart)
- **Auth:** `Authorization: Bearer <token>` header OR session cookie `rokki_session` (web UI only)
- **Response envelope:** every 200/201 returns `{ "data": ..., "meta"?: {...} }`; every 4xx/5xx returns `{ "errors": [...] }`
- **IDs:** UUID v4 strings everywhere except tickers (`BRKL`) and slugs (`helios`)
- **Timestamps:** ISO 8601 with timezone (`2026-04-19T14:32:07.123Z`)
- **Pagination:** `?cursor=<opaque>&limit=<n>` (max 100). Response `meta.next_cursor` is null when exhausted.

## 2.2 Error codes

Standard HTTP status plus a machine-readable `code`:

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Request body fails validation |
| 401 | `unauthenticated` | Missing/invalid token |
| 403 | `forbidden` | Token valid but lacks permission |
| 403 | `quota_exceeded` | Over user/tool quota |
| 403 | `approval_required` | Action needs admin approval first |
| 404 | `not_found` | Resource doesn't exist OR caller lacks access (indistinguishable to prevent enumeration) |
| 409 | `conflict` | Unique constraint violation (e.g., ticker already used) |
| 413 | `payload_too_large` | File too large for upload endpoint |
| 422 | `unprocessable` | Request valid but semantic constraint fails |
| 429 | `rate_limited` | Per-token rate limit hit |
| 500 | `internal_error` | Server error (logged) |
| 502 | `upstream_error` | Downstream service (Anthropic API, Azure Blob) failed |
| 503 | `maintenance` | Scheduled maintenance window |

Error response shape:
```json
{
  "errors": [
    {
      "code": "quota_exceeded",
      "message": "You've used your monthly quota for this tool.",
      "details": { "tool": "aerial-reels", "resets_at": "2026-05-01T00:00:00Z" },
      "retry_after_seconds": null
    }
  ],
  "request_id": "req_01HF..."
}
```

Every error response includes a `request_id` matching the `X-Request-Id` response header for log correlation.

## 2.3 Rate limits

Per-token, sliding window:

| Endpoint category | Requests / minute | Requests / hour |
|---|---|---|
| Read endpoints (GET) | 300 | 5000 |
| Write endpoints (POST/PATCH/DELETE) | 60 | 1500 |
| Search / AI endpoints | 30 | 500 |
| Tool invocations | Per-tool rate limit (see §06) | — |
| Auth endpoints (magic link) | 5 | 20 |

Exceeded → 429 with `Retry-After` header in seconds.

## 2.4 Auth endpoints

### 2.4.1 Request magic link

```
POST /v1/auth/magic-link
```
Body:
```json
{ "email": "architect@example.com", "redirect_to": "/p/BRKL" }
```
Response (200):
```json
{ "data": { "sent": true } }
```
Notes:
- Always returns 200 even if email doesn't exist (avoid enumeration)
- Rate limited to 5/min per IP
- If an unaccepted invite exists for this email, the link auto-accepts on click
- See §04.1 for full flow

### 2.4.2 Validate magic link

Handled by Supabase Auth at `/auth/v1/verify`. Not a Rokki API route. See §04.1.

### 2.4.3 Current session

```
GET /v1/me
```
Response:
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "zack@...",
      "full_name": "Zack McKerley",
      "avatar_url": null,
      "is_platform_admin": true,
      "settings": { "theme": "dark", "density": "default" }
    },
    "orgs": [
      { "id": "uuid", "slug": "helios", "name": "HELIOS", "role": "owner" }
    ],
    "current_org_id": "uuid",
    "token_scopes": ["read", "write"],
    "project_restrictions": null
  }
}
```

### 2.4.4 Logout

```
POST /v1/auth/logout
```
Clears session cookie. For token auth, this is a no-op (tokens revoke via §2.15).

## 2.5 Orgs

### 2.5.1 List my orgs
```
GET /v1/orgs
```
Response: `{ "data": [{ "id", "slug", "name", "role" }] }`

### 2.5.2 Create org
```
POST /v1/orgs
```
Body: `{ "slug": "helios", "name": "HELIOS" }`
- `slug` must match `^[a-z][a-z0-9-]{1,38}[a-z0-9]$`
- Caller becomes owner (via trigger)
Response: full org object.

### 2.5.3 Get org
```
GET /v1/orgs/:id_or_slug
```
RLS ensures caller is a member.

### 2.5.4 Update org
```
PATCH /v1/orgs/:id_or_slug
```
Body (any subset): `{ "name": "...", "settings": {...} }`
Requires `admin` or `owner` role.

### 2.5.5 List org members
```
GET /v1/orgs/:id_or_slug/members
```
Response: `{ "data": [{ "user_id", "full_name", "avatar_url", "role", "joined_at" }] }`

### 2.5.6 Invite member
```
POST /v1/orgs/:id_or_slug/members
```
Body: `{ "email": "new@example.com", "role": "member" }`
Creates an invite + sends magic link email. Response: invite object.

### 2.5.7 Update member role
```
PATCH /v1/orgs/:id_or_slug/members/:user_id
```
Body: `{ "role": "admin" }`
Cannot change own role. Must be admin or owner.

### 2.5.8 Remove member
```
DELETE /v1/orgs/:id_or_slug/members/:user_id
```

## 2.6 Projects

### 2.6.1 List projects
```
GET /v1/projects?org=:slug&status=:status&q=:search
```
Response includes ticker, name, status, last activity.

### 2.6.2 Create project
```
POST /v1/projects
```
Body:
```json
{
  "org_id": "uuid",
  "ticker": "BRKL",
  "name": "123 Brickell Renovation",
  "description": "...",
  "type": "construction",
  "metadata": { "address": "123 Brickell Ave, Miami FL", "folio": "0141080430010" }
}
```
- `ticker` must match `^[A-Z][A-Z0-9]{1,9}$`
- If omitted, server auto-generates from `name` (strip vowels, first 4-6 consonants)
- Conflict on duplicate ticker → 409

### 2.6.3 Get project
```
GET /v1/projects/:ticker
GET /v1/projects/:org_slug:ticker      // cross-org disambiguation
```

### 2.6.4 Update project
```
PATCH /v1/projects/:ticker
```
Requires `owner` or `manager` project role.

### 2.6.5 Archive project
```
DELETE /v1/projects/:ticker
```
Soft delete (sets `archived_at`). Hard delete requires separate endpoint `DELETE /v1/projects/:ticker/permanent` with `X-Confirm-Permanent: true` header; owner only.

### 2.6.6 Project members
```
GET    /v1/projects/:ticker/members
POST   /v1/projects/:ticker/members           { email, role }
PATCH  /v1/projects/:ticker/members/:user_id  { role }
DELETE /v1/projects/:ticker/members/:user_id
```

## 2.7 Tasks

### 2.7.1 List tasks
```
GET /v1/projects/:ticker/tasks?status=:s&assignee=:u&priority=:p&due_before=:d&q=:search
```
Default sort: `priority ASC, due_date ASC NULLS LAST, created_at DESC`.

### 2.7.2 Create task
```
POST /v1/projects/:ticker/tasks
```
Body:
```json
{
  "title": "Order impact windows",
  "description": "Markdown OK",
  "assignees": ["user-uuid-1", "user-uuid-2"],
  "due_date": "2026-05-01",
  "priority": 2,
  "labels": ["procurement", "long-lead"]
}
```
Response includes server-assigned `ticker_seq` (e.g., 42 → displayed as `BRKL-42`).

### 2.7.3 Get task
```
GET /v1/tasks/:id
GET /v1/projects/:ticker/tasks/:seq
```

### 2.7.4 Update task
```
PATCH /v1/tasks/:id
```
Any subset of: `title, description, status, priority, due_date, labels, metadata`.
Status transitions: any → any (no state machine enforced at API level).

### 2.7.5 Complete task
```
POST /v1/tasks/:id/complete
```
Convenience: sets `status='done'` and `completed_at=now()`.

### 2.7.6 Assignees
```
POST   /v1/tasks/:id/assignees          { user_ids: [...] }      // add
DELETE /v1/tasks/:id/assignees/:user_id                           // remove
```

### 2.7.7 Dependencies
```
POST   /v1/tasks/:id/dependencies       { depends_on: "task-id" }
DELETE /v1/tasks/:id/dependencies/:depends_on_id
```
Cycle detection on insert → 422.

## 2.8 Files

See §05 for full upload/download/permission flow. Endpoints:

```
GET    /v1/projects/:ticker/files?folder=:p&q=:search
POST   /v1/projects/:ticker/files/upload           // small files: multipart
POST   /v1/projects/:ticker/files/upload-url       // large files: get signed URL
POST   /v1/files/:id/finalize                      // after signed URL upload
GET    /v1/files/:id
GET    /v1/files/:id/download                      // returns signed Azure URL
GET    /v1/files/:id/content?range=:bytes          // inline content, range-supported
PATCH  /v1/files/:id                               // rename, move folder, metadata
PATCH  /v1/files/:id/permissions                   // change visibility
DELETE /v1/files/:id                               // soft delete
GET    /v1/files/:id/versions                      // full version history
```

### 2.8.1 Upload (small)
```
POST /v1/projects/:ticker/files/upload
Content-Type: multipart/form-data
```
Fields:
- `file` — binary
- `folder` — optional, default `/`
- `visibility` — `project` | `owners` | `custom`
- `visibility_roles` — array of project_role, required if `visibility=custom`
- `visibility_users` — array of user_id, required if `visibility=custom`
- `supersedes` — optional file_id to version over

Size limit: 25 MB for this endpoint; larger → use upload-url.

### 2.8.2 Upload URL (large)
```
POST /v1/projects/:ticker/files/upload-url
```
Body:
```json
{
  "filename": "A200_Rev3.pdf",
  "size_bytes": 84230123,
  "mime_type": "application/pdf",
  "folder": "/drawings",
  "visibility": "project"
}
```
Response:
```json
{
  "data": {
    "upload_id": "uuid",
    "signed_url": "https://files.rokki.ai/...",
    "method": "PUT",
    "headers": { "x-ms-blob-type": "BlockBlob", "Content-Type": "application/pdf" },
    "expires_at": "2026-04-19T15:00:00Z"
  }
}
```
Client PUTs the file to `signed_url`, then calls `/v1/files/:id/finalize` (where `:id` == `upload_id`).

### 2.8.3 Finalize
```
POST /v1/files/:upload_id/finalize
```
Body: `{ "sha256": "hex-of-content" }`
- Validates the blob exists and size matches
- Triggers virus scan
- Triggers RAG indexer
- Returns final file object

### 2.8.4 Download
```
GET /v1/files/:id/download
```
Response: 302 redirect to signed Azure URL, valid for 5 minutes. Or with `?response=json`, returns:
```json
{ "data": { "url": "...", "expires_at": "..." } }
```

## 2.9 Search & AI

### 2.9.1 Project semantic search
```
POST /v1/projects/:ticker/search
```
Body: `{ "query": "ceiling height", "limit": 20 }`
Returns matching file chunks (with page refs), tasks, comments — all scoped by RLS.

### 2.9.2 Ask project AI
```
POST /v1/projects/:ticker/ask
```
Body:
```json
{
  "question": "What's the ceiling height on the master suite?",
  "conversation_id": null  // or existing for threaded chat
}
```
Response (streaming, Server-Sent Events):
```
event: context
data: {"sources": [{"file_id": "...", "page": 3, "excerpt": "..."}]}

event: token
data: {"text": "The ceiling height is 9'-0" "}

event: token
data: {"text": "throughout..."}

event: done
data: {"conversation_id": "uuid", "sources_used": [...], "tokens": 342}
```
Uses RAG over file_chunks + task context + recent activity. See §05 for indexing.

### 2.9.3 Dashboard AI
```
POST /v1/me/ask
```
Same shape, scoped to all user-accessible projects.

## 2.10 Tools

See §06 for full tool spec. Endpoints:

```
GET    /v1/tools?visibility=&q=              // marketplace list
GET    /v1/tools/:slug                        // tool detail (public metadata)
POST   /v1/tools                              // create (draft) or update
POST   /v1/tools/:slug/versions               // push a new version
POST   /v1/tools/:slug/publish                // publish a draft version
POST   /v1/tools/:slug/invoke                 // execute
GET    /v1/tools/:slug/invocations            // caller's history
POST   /v1/tools/:slug/access                 // grant access (owner)
DELETE /v1/tools/:slug/access/:subject_id
POST   /v1/tools/:slug/request-access         // user requests access
```

### 2.10.1 Create/update tool
```
POST /v1/tools
```
Body:
```json
{
  "slug": "aerial-reels",
  "name": "Aerial Reels",
  "description": "Generate aerial video of a property from an address.",
  "visibility": "org",
  "input_schema": { "type": "object", "properties": { "address": {"type": "string"} } },
  "requires_providers": [],
  "approval_mode": "auto",
  "cost_credits": 5,
  "cost_usd_estimate": 0.40,
  "timeout_seconds": 120,
  "memory_mb": 512
}
```
Creates tool in draft state. Use `POST /v1/tools/:slug/versions` to push code.

### 2.10.2 Push version
```
POST /v1/tools/:slug/versions
Content-Type: multipart/form-data
```
Fields:
- `version` — semver string
- `skill_md` — text content of SKILL.md
- `scripts` — zip archive of scripts folder
- `runtime` — `node:20` | `python:3.12`
- `entrypoint` — relative path

Response: `{ "data": { "version_id": "uuid", "published": false } }`

### 2.10.3 Publish
```
POST /v1/tools/:slug/publish
```
Body: `{ "version": "1.2.0" }`
Moves a specific version to `published=true` and updates `tools.current_version`.

### 2.10.4 Invoke
```
POST /v1/tools/:slug/invoke
```
Body:
```json
{
  "inputs": { "address": "123 Brickell Ave" },
  "project_id": "uuid-or-null",
  "async": false
}
```
- If `async=false` and tool completes < 30s: 200 with result
- If `async=false` and tool exceeds 30s: 202 with invocation_id; client polls `/v1/tools/:slug/invocations/:id`
- If `async=true`: always returns 202 immediately

Response (sync success):
```json
{
  "data": {
    "invocation_id": "uuid",
    "status": "success",
    "output": { "video_url": "...", "thumbnail_url": "..." },
    "cost_credits": 5,
    "cost_usd": 0.38,
    "duration_ms": 12340
  }
}
```

Response (approval required):
```json
{
  "data": {
    "invocation_id": "uuid",
    "status": "approval_required",
    "approval_id": "uuid",
    "approvers": ["zack-user-id"]
  }
}
```

Response (quota):
```json
{
  "errors": [{
    "code": "quota_exceeded",
    "message": "Monthly quota exhausted.",
    "details": { "used": 50, "limit": 50, "resets_at": "..." }
  }]
}
```

## 2.11 Approvals

```
GET   /v1/approvals?status=pending&type=
POST  /v1/approvals/:id/resolve
```
Resolve body:
```json
{ "decision": "approved" | "denied", "note": "...", "grant_duration_days": 90 }
```

## 2.12 Activity

```
GET /v1/projects/:ticker/activity?since=:iso&action=:a&cursor=
GET /v1/orgs/:slug/activity
GET /v1/me/activity
```

## 2.13 Comments

```
GET    /v1/:entity_type/:entity_id/comments
POST   /v1/:entity_type/:entity_id/comments    { body, parent_id? }
PATCH  /v1/comments/:id                         { body }
DELETE /v1/comments/:id
```
`entity_type` ∈ `task | file | project`.

## 2.14 API keys (BYOK)

```
GET    /v1/me/keys                    // returns masked list (via api_keys_public view)
POST   /v1/me/keys                    { provider, key }
DELETE /v1/me/keys/:id
```
POST encrypts and stores. Response never returns the key.

## 2.15 Access tokens (for external AIs)

```
GET    /v1/me/tokens
POST   /v1/me/tokens                  { name, scopes: [...], project_restrictions?, expires_in_days? }
DELETE /v1/me/tokens/:id
POST   /v1/me/tokens/:id/revoke       { reason }
```
POST returns plaintext token **once** in the response:
```json
{
  "data": {
    "id": "uuid",
    "name": "My Claude Desktop",
    "token": "rk_live_abc123...",    // shown once, never again
    "prefix": "rk_live_a",
    "scopes": ["read", "write"],
    "expires_at": "2026-07-18T..."
  }
}
```

## 2.16 Admin endpoints

Platform admin only (`profiles.is_platform_admin = true`). All require a short-lived elevated session (see §04.4).

```
GET   /v1/admin/users?q=&cursor=
POST  /v1/admin/users/:id/suspend
POST  /v1/admin/users/:id/unsuspend
POST  /v1/admin/emergency-access              { target, reason }  // starts emergency session
POST  /v1/admin/emergency-access/:id/end
GET   /v1/admin/spend                         // rolling 24h / 7d / 30d cost by user/tool/provider
POST  /v1/admin/killswitch/tool/:slug         { state: "paused" | "active" }
POST  /v1/admin/killswitch/platform           { state: "paused" | "active" }
GET   /v1/admin/audit                         // global audit log
```

## 2.17 Invite acceptance

```
POST /v1/invites/:token/accept
```
Response: redirects to the scoped resource (project terminal if project invite, dashboard if org invite). Handled by the magic link flow; see §04.1.

## 2.18 Health & meta

```
GET /v1/health                  // 200 if DB + Blob reachable
GET /v1/version                 // { api_version, commit_sha, deployed_at }
```

## 2.19 Webhooks (Phase 2+)

Outgoing webhooks to customer-defined URLs on events (task.created, file.uploaded, etc.). Not in Phase 1. Placeholder:

```
GET  /v1/webhooks
POST /v1/webhooks               { url, events: [...], secret? }
DELETE /v1/webhooks/:id
```

## 2.20 CORS

Allowed origins:
- `https://app.rokki.ai` (production web)
- `https://staging.rokki.ai`
- `http://localhost:3000` (local dev)
- For token auth, CORS is not enforced (non-browser clients)
- Credentials allowed on cookie-auth origins; not on token-auth origins (enforces Authorization header only)

Preflight: all routes respond to OPTIONS with `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-Id`.

## 2.21 Idempotency

Mutating endpoints accept `Idempotency-Key: <uuid>` header. Server stores key→response for 24h and returns cached response on repeat. Required for:
- `POST /v1/projects` (avoid double-create)
- `POST /v1/tasks`
- `POST /v1/tools/:slug/invoke`
- File uploads (via upload_id)

Others are optional but recommended for write retries.

## 2.22 API versioning policy

- Current version: `v1`
- Breaking changes require a new version (`v2`) — never break v1 in place
- Deprecations: old endpoint returns `Deprecation: date` header and `Sunset: date`
- Minimum deprecation window: 12 months for public APIs, 3 months for internal-only

## 2.23 Common pitfalls

- **404 vs 403:** `not_found` is returned for BOTH missing and forbidden resources. Never return 403 for a resource the caller can't see — that leaks existence. Only return 403 for resources they can see but can't mutate.
- **Rate limit on magic link:** 5/min per IP is aggressive. For legitimate bulk invites, the admin endpoint bypasses this — use `POST /v1/orgs/:slug/members` with server-side session, not `POST /v1/auth/magic-link` in a loop.
- **Idempotency keys must be unique per logical operation,** not per attempt. A retry of the same `POST /v1/tasks` with the same payload uses the same key.
- **Streaming responses (SSE) for `ask` endpoints** require HTTP/1.1 or HTTP/2 with proper flushing. Vercel supports this, but local dev behind a proxy might buffer — test with `curl` directly.
- **The `ticker` in URL paths** is always uppercase. Lowercase requests 301-redirect to the canonical uppercase URL.
- **File uploads via multipart cap at 25 MB** — not a Node/Next.js limit (which can be configured) but an intentional product choice. Large files go through signed URL direct-to-Blob to avoid proxying bytes through our server.
- **Do not return `ticker_seq` without the ticker** in responses — always format as `"BRKL-42"` for display. Raw seq values without context are meaningless to clients.
- **When creating a project, the ticker collision response is 409, not 400.** 400 suggests bad input; 409 tells the client "your input was fine, but the resource conflicts" — UI can prompt for a different ticker.
- **The `GET /v1/me` endpoint is called on every page load** in the web UI. Keep it fast (< 50ms) — cache org list at the edge if needed.
