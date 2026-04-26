# 12 — MCP Parity

**Scope:** Audit of every UI/REST capability against the MCP tool surface.
Identifies gaps so we can close them in priority order.

> The product principle (`CLAUDE.md`, Non-negotiables): *"every feature
> available in UI is available via API and MCP tool. No exceptions."*
> This doc is the audit. The matrix UI lives at `/admin/mcp` and is
> built off the same data file: `apps/web/src/lib/mcp-parity.ts`.

## 12.1 How to read this

For each row:

- **PRESENT** — there is a working REST endpoint AND a corresponding MCP
  tool that an LLM client can call.
- **PARTIAL** — read tool exists but no write tool (or vice versa), OR
  the existing tool covers some shape of the API but not all of it.
- **MISSING** — REST endpoint exists; no MCP tool. These are the gaps.
- **UI-ONLY (admin-only)** — intentionally not exposed via MCP. Includes
  browser-only auth flows, sensitive credential management, public
  unauthenticated endpoints, and the entire `/v1/admin/*` surface.

## 12.2 Counts

Last reconciled: 2026-04-27 against:
- `apps/web/src/app/api/v1/**/route.ts`
- `apps/mcp-server/src/tools.ts`

| Status | Count |
|---|---|
| Present | 35 |
| Partial | 6 |
| Missing | 35 |
| UI-only | 16 |
| **Total** | 92 |

## 12.3 Closing the gaps — recommended priority order

The closing order below is opinionated: it weights write operations on
common resources highest, since those are the things AI agents most
need to drive end-to-end workflows.

### 12.3.1 High priority — write operations on common resources

These are the tools an AI agent needs to actually drive Rokki, not just
observe it.

- **`rokki_get_task`** — already in spec (§3.4.4) but not implemented.
  An agent updating a task currently has to use `rokki_list_tasks` and
  filter; that's lossy and doesn't return comments/activity.
- **`rokki_upload_file`** — already in spec (§3.4.10) but not
  implemented. Highest-impact write gap. Without it, AI workflows that
  produce documents (drafts, reports, generated PDFs) can't deposit
  them in the terminal.
- **`rokki_subtasks_*`** — Tier-1 task feature shipped 2026-04-27 with
  REST endpoints, no MCP coverage yet. AI agents breaking a task into
  steps can't materialise the steps.
- **`rokki_*_drawing_annotation`** — construction-vertical annotations.
  AI walking permit drawings should be able to read existing markup and
  place its own. Both list and create gaps are high.
- **`rokki_get_budget` / `rokki_get_schedule` / `rokki_get_permits`** —
  construction depth modules. The HELIOS use case (Zack reviewing a 4-6
  unit deal) needs an agent that can read budget actuals + permit
  status, and these are not exposed.

### 12.3.2 Medium priority — read operations on common resources

These improve agent UX but don't unblock new workflows.

- **`rokki_me`** — return current user + scopes + project_restrictions.
  Useful for the LLM to introspect "what can I do?"
- **`rokki_get_terminal`** — structured detail (members, file count,
  task counts). `rokki_summarize_terminal` exists but returns LLM prose,
  not data.
- **`rokki_get_space`** — space settings, member count, terminals list.
- **`rokki_list_folders`** — folder tree (currently agents have to
  derive paths from `rokki_list_files`).
- **`rokki_download_file`** — return a download URL. `rokki_read_file`
  returns excerpts; agents that want to forward a file binary need a
  signed URL.
- **`rokki_*_share_link`** — create/manage share links. Useful for AI
  to generate shareable links to docs.
- **Space member management** — `rokki_update_space_member_role`,
  `rokki_remove_space_member`. Mirror what's at the terminal level.
- **Terminal member management** — `rokki_update_terminal_member_role`,
  `rokki_remove_terminal_member`. Currently you can invite but not
  promote / remove.
- **Task dependencies / watchers** — `rokki_set_task_dependency`,
  `rokki_add_task_watcher`. AI can create chains of work but can't wire
  them up.
- **Messages** — `rokki_list_threads`, `rokki_send_message`. AI assistant
  reading and replying to DMs.
- **Approvals** — `rokki_list_approvals`. Agents that trigger
  approval-gated tools should be able to check whether their request
  was approved.
- **Activity** — REST endpoints listed in `docs/02_API.md §2.12` are
  not implemented; UI reads via realtime. `rokki_recent_activity` MCP
  tool exists. Either implement the REST endpoints or document MCP as
  the only path.
- **Briefing** — `rokki_briefing` (broad, across all spaces). The
  `/v1/briefing` REST endpoint exists; `rokki_what_changed` covers a
  single terminal scope but not the dashboard view.

### 12.3.3 Low priority — convenience / nice-to-have

- **Comment edit/delete** — `rokki_edit_comment`, `rokki_delete_comment`.
- **File restore** — `rokki_restore_file` (undo trash).
- **Folder duplicate** — `rokki_duplicate_folder`.
- **Calendar disconnect** — `rokki_disconnect_calendar`.
- **Vendors** — `rokki_list_vendors` (construction-vertical).
- **Flags** — `rokki_get_flags` (read my flag values).
- **Announcements** — `rokki_list_announcements` + dismiss.
- **Space update** — `rokki_update_space` (settings/branding).
- **Archive terminal** — clean verb instead of `update_terminal` with
  status flip.
- **Tool detail** — `rokki_get_tool` (currently `rokki_list_tools`
  returns enough).
- **Share link manage** — `rokki_delete_share_link`.
- **Specialized assignee tools** — `rokki_add_task_assignee`,
  `rokki_remove_task_assignee`. Currently set at create/update; explicit
  add/remove tools are nicer ergonomics for agents.

## 12.4 Intentionally not exposed via MCP

These are UI-only by design and should NOT get MCP equivalents:

| Resource | Reason |
|---|---|
| `auth/*` (magic link, password login, sign out, account ring) | Browser-only flows. MCP authenticates via bearer tokens minted in `/v1/me/tokens`. |
| `me/api-keys/*` | Sensitive credential management. UI-only. |
| `me/tokens/*` | Same — chicken-and-egg if MCP could mint its own credentials. |
| `me/push-subscriptions/*` | Web push only. |
| `approvals/:id` (resolve) | Approving a tool invocation on someone's behalf is exactly what we don't want via MCP. Cookie-only. |
| `share/:token` | Public unauthenticated endpoint. |
| `health` | Ops endpoint. |
| `calendar/connect/*`, `calendar/callback/*` | OAuth flows. |
| `files/:id/permanent` | Owner-only destructive action. |
| `admin/**` | Platform-admin surface. |

## 12.5 MCP-only capabilities (no REST equivalent)

A few MCP tools have no direct REST endpoint and that's fine — they're
LLM-flavored conveniences that wouldn't make sense as plain HTTP:

- `rokki_summarize_terminal` — uses MCP sampling (§03 §3.6).
- `rokki_draft_update` — uses MCP sampling.
- `rokki_what_changed` — narrative summary; UI reads activity directly.
- `rokki_ask_project` — the spec mentions a `POST /v1/projects/:ticker/ask`
  REST endpoint but it's not implemented; the MCP tool fulfills that
  capability via sampling.

If we ever expose any of these as REST endpoints, the matrix should be
updated.

## 12.6 Maintaining this doc

The data lives in `apps/web/src/lib/mcp-parity.ts`. Update that file
when:

- A new REST endpoint ships (add a row, leave `mcpTool: null`,
  `status: "missing"`)
- A new MCP tool ships (find the matching row, set `mcpTool`, flip
  `status` to `present`)
- A REST endpoint is removed (remove the row, or update if it was
  superseded)
- A capability is reclassified (e.g., something was `admin-only` and is
  now public)

After updating, regenerate this doc by hand — the matrix is small
enough that a static doc + a runtime page is simpler than a build-time
generator.
