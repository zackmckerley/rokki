# 06 — Tools & Marketplace

**Scope:** Tool manifest format, publish flow, execution sandbox, access approval, quotas, BYOK, and MCP sampling for tools that need LLM inference. Also: how existing Claude skills become Rokki tools.

## 6.1 What a tool is

A Rokki tool is a function exposed to users (via web UI) and their AIs (via MCP §03). It runs on Rokki's infrastructure — users invoke it, the code lives on our server, they never see the source.

Tools are defined by a **SKILL.md** (metadata + instructions) plus scripts (code).

## 6.2 Tool lifecycle

```
draft → version pushed → admin review → published → used
                                           ↓
                                        deprecated → archived
```

1. **Author creates a tool** (metadata only) — it enters `draft` state, private to them
2. **Author pushes a version** — SKILL.md + scripts bundled; runs through validation + sandbox test
3. **Author requests publish** — if the author is not a platform admin, publish requires admin review
4. **Published** — tool is invokable; visible per its `visibility` setting
5. **Deprecated** — can still be invoked, warning shown, no new access grants
6. **Archived** — no longer invokable; code retained for audit

## 6.3 SKILL.md format

```markdown
---
name: aerial-reels
version: 1.2.0
description: |
  Generate aerial satellite imagery and video of real property locations for social media content.
  Takes a property address and produces satellite images and animated videos (zoom-in and 360° orbit)
  for Instagram Reels, TikTok, carousels, and stories. Includes exact property boundaries from the
  county GIS system.
runtime: node:20
entrypoint: index.js
timeout_seconds: 120
memory_mb: 1024
requires_providers: []                # ['anthropic', 'openai'] if needs LLM
cost_credits: 5
cost_usd_estimate: 0.40
cost_description: |
  Uses Google Maps Static API for satellite imagery (~$0.002/image × 30 frames).
approval_mode: auto                    # auto | one_time | per_invocation
tags: [media, aerial, real-estate]
inputs:
  type: object
  properties:
    address:
      type: string
      description: Street address. US only for now.
    style:
      type: string
      enum: [zoom, orbit, hybrid]
      default: zoom
  required: [address]
outputs:
  type: object
  properties:
    video_url: { type: string }
    thumbnail_url: { type: string }
    duration_seconds: { type: number }
---

# aerial-reels

<!-- Everything below the frontmatter is documentation / prompt context for the LLM -->

## How it works

1. Geocode the address via Google Maps Geocoding API
2. Pull property boundary from county GIS (Miami-Dade supported in v1.2)
3. Request 30 satellite tiles at stepped zoom levels
4. Composite + overlay boundary polygon
5. Render to MP4 via ffmpeg
6. Upload result to user's project (if `project_id` passed) or return URL

## Inputs

The `address` must be parseable — incomplete addresses fail gracefully with an error.

## Outputs

A 1080×1920 MP4 suitable for Instagram Reels (9:16, 30fps, 6-8 seconds).
```

The frontmatter is parsed as YAML. The body is:
- Not executed
- Used as context for the LLM when deciding whether to call this tool (via MCP description padding — optional)

## 6.4 Publishing

### 6.4.1 CLI

```
npm install -g @rokki/cli
rokki login                                # stores token at ~/.rokki/token
rokki push ./aerial-reels                  # uploads the folder
```

The CLI:
1. Reads `SKILL.md`, validates frontmatter
2. Zips the folder (excluding `.git`, `node_modules`, `.env*`)
3. POSTs to `/v1/tools` (creates if new slug) then `/v1/tools/:slug/versions` (uploads version)
4. Shows validation output, waits for admin review if required

### 6.4.2 Server-side validation on upload

1. **Parse SKILL.md** — must be valid YAML frontmatter + markdown body
2. **Schema validation** — frontmatter matches a strict JSON Schema
3. **Static analysis** — scan scripts for:
   - Hardcoded secrets (regex for `AKIA`, `sk_live_`, etc.)
   - Disallowed imports (`child_process`, `fs`, `net`, `dgram` in Node — though we sandbox, we reject obvious red flags at this layer)
   - Size: total bundle < 50 MB, individual file < 5 MB
4. **Sandbox test** — spin up sandbox, run with sample inputs, verify it doesn't crash
5. **On success** — write `tool_versions` row, set `published = false`
6. **Publish** is a separate action (see §6.4.3)

### 6.4.3 Admin review (non-admin authors)

If the author is not a platform admin, publishing their tool creates an `approvals` row of type `tool_publish`. The platform admin sees it in their approval inbox:

- Tool name, description, author
- Diff vs. previous version (if any)
- Input/output schemas
- Execution metrics from sandbox test
- Approve → publish; Deny → version is rejected, not re-pushable as same version

For platform admin's own tools: publish is automatic (no self-approval needed).

### 6.4.4 Publishing

`POST /v1/tools/:slug/publish { version }`:
- Sets `tool_versions.published = true`, `tools.current_version = version`
- Notifies MCP sessions of `tools/list_changed`
- Writes `activity` with action `tool.publish`

### 6.4.5 Deprecation

`POST /v1/tools/:slug/deprecate`:
- Tool remains invokable; description prefixed with `[DEPRECATED]`
- Attempts to grant new access → 422 with message
- After 30 days: auto-archive (invocations start failing); owner can extend

## 6.5 Execution sandbox

Tools run in isolated containers — per-invocation, no state between calls.

### 6.5.1 Isolation

Per-invocation:
- Fresh container instance (Azure Container App revision OR lightweight Firecracker VM via Fly.io Machines)
- Read-only filesystem except `/tmp`
- No network by default; explicit allow-list per tool (see §6.5.4)
- No access to Rokki DB
- Environment variables: only `ROKKI_TOOL_ID`, `ROKKI_INVOCATION_ID`, `ROKKI_CALLBACK_URL`, `ROKKI_CALLBACK_TOKEN`, plus any resolved BYOK keys for this invocation
- Memory cap: from tool's `memory_mb` (128/256/512/1024/2048)
- CPU: 1 vCPU share
- Time cap: from tool's `timeout_seconds` (hard kill at limit)

### 6.5.2 Filesystem layout inside container

```
/app/
  SKILL.md
  index.js (or entrypoint)
  package.json
  node_modules/           # installed at version-push time
/tmp/                     # writable scratch, cleared after
```

Scripts are bundled at version-push. Dependencies are installed server-side during validation (not at runtime). `node_modules` is baked into the container image.

### 6.5.3 Calling back to Rokki

Tools communicate with Rokki via an internal callback URL:

```
POST $ROKKI_CALLBACK_URL/v1/tool-callback
Authorization: Bearer $ROKKI_CALLBACK_TOKEN
```

Callback token is short-lived (tool's timeout + 30s), scoped to the single invocation, and can only:
- Read inputs
- Write outputs
- Read project files (respecting caller's permissions)
- Request sampling (for LLM-backed tools)
- Upload files to the caller's project
- Call external allowlisted URLs on behalf of the user

The callback token gives the tool the same DB access as the *invoking user*, via the callback proxy (which re-applies RLS). So a tool invoked by a guest architect cannot touch the contract file any more than the architect can themselves.

### 6.5.4 Network policy

Each tool declares its `network.allowed_hosts` in SKILL.md frontmatter:

```yaml
network:
  allowed_hosts:
    - maps.googleapis.com
    - api.mapbox.com
```

Tool's container has a proxy/firewall that denies all outbound except listed hosts. Requests to non-allowed hosts return connection refused.

Default: only `$ROKKI_CALLBACK_URL` host. Outbound internet requires explicit allowlist and passes admin review.

### 6.5.5 SDK

To make tool code simple, provide `@rokki/tool-sdk`:

```javascript
import { tool, sampling, files, output } from '@rokki/tool-sdk';

tool.run(async (inputs, context) => {
  const excerpts = await files.search(context.project_id, 'permit conditions');
  const summary = await sampling.generate({
    prompt: `Summarize: ${excerpts.map(e => e.content).join('\n')}`,
    max_tokens: 500
  });
  return output({ summary });
});
```

SDK wraps the callback URL + token, handles retries, types the context.

### 6.5.6 BYOK key injection

Before launching the container:
1. Server decrypts user's relevant BYOK keys (§04.3)
2. Injects as env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.
3. Container runs with keys in memory only
4. Container exits; keys are gone

If the tool declares `requires_providers: ['anthropic']` and the user has no key AND sampling is unavailable, the invocation fails before the container starts with `error: missing_api_key`.

### 6.5.7 Execution result

Tool returns JSON via stdout or HTTP callback. Server:
- Validates against `output_schema` (if declared)
- Writes `tool_invocations` row with final `status`, `duration_ms`, `output_sha256`, cost
- Large outputs (> 1 MB) are stored in Blob and the row contains a reference

## 6.6 Access control

### 6.6.1 Visibility

Set on the tool:
- `private` — only owner sees it
- `org` — anyone in the owner's org
- `project` — anyone with access to projects where the tool was granted via `tool_access` with `subject_type='project'`
- `public` — every Rokki user

### 6.6.2 Explicit access grants

The `tool_access` table grants access to a subject (user, project, or org). Owner of the tool can add/remove grants from the tool's settings page or CLI.

### 6.6.3 Access request flow

1. User discovers a tool in the marketplace, clicks "Request access"
2. `approvals` row created with type `tool_access`
3. Tool owner + platform admin see it in their approval inbox
4. On approve: `tool_access` row inserted (optionally with `expires_at`)
5. MCP sessions of the approved user see `tools/list_changed`

### 6.6.4 Approval modes per tool

- `auto` — no approval needed for any invocation (default)
- `one_time` — first invocation by a new user triggers approval; subsequent invocations by that user proceed
- `per_invocation` — every invocation awaits approval

Per-invocation approvals:
- Invocation enters `approval_required` state
- `approvals` row created with context including inputs
- Approver has 24h to resolve
- On approve: invocation resumes (if within window)
- On deny: invocation fails with `error: approval_denied`

## 6.7 Quotas

### 6.7.1 Credit model

Each tool has `cost_credits` (integer). Each user has quotas in the `quotas` table.

### 6.7.2 Quota scope

- Per-user, per-tool, per-period (day/month)
- Per-user, all tools aggregate
- Per-org, all tools aggregate

Default quotas for a new user:
- 50 credits/day per tool (unless tool sets lower)
- 500 credits/day total
- Admin can override per user

### 6.7.3 Enforcement

Before dispatching a tool:
1. Sum `used_credits` across applicable quotas
2. If any quota would exceed its limit with this invocation: return `quota_exceeded`
3. Otherwise: increment `used_credits` BEFORE invocation (defensive)
4. On failure: decrement (refund)
5. On success: retain the deduction

Atomicity via UPDATE … SET used_credits = used_credits + $amount WHERE used_credits + $amount <= limit_credits RETURNING *. Zero rows returned → quota exceeded.

### 6.7.4 Quota reset

- Daily: reset at 00:00 UTC
- Monthly: reset at first of month UTC

Implemented via a cron job that runs `UPDATE quotas SET used_credits = 0, reset_at = next_reset WHERE reset_at < now()`.

### 6.7.5 Platform killswitch

Platform admin can globally pause:
- Specific tool: `admin/killswitch/tool/:slug` — pauses all invocations
- Specific user: `admin/killswitch/user/:id` — pauses all user's invocations
- Platform: `admin/killswitch/platform` — pauses everything

Killswitch is stored in a fast cache (Redis) and checked at dispatch time with < 10ms overhead.

## 6.8 Invocation flow (end-to-end)

```
User's Claude calls rokki.tools.aerial_reels({address: "123 Brickell"})
    │
    ▼
MCP server receives tool call with user's token
    │
    ▼
Validate: token valid? tool exists? user has access?  ──No──> return error
    │ Yes
    ▼
Check approval mode:
   auto → proceed
   one_time → check tool_access; if none, create approval, return approval_required
   per_invocation → create approval, return approval_required
    │ Proceeds
    ▼
Check quotas: deduct credits defensively  ──Exceeded──> return quota_exceeded
    │ OK
    ▼
Resolve BYOK keys if requires_providers is set
    │
    ▼
Insert tool_invocations row (status=running)
    │
    ▼
Dispatch to tool executor (HTTPS internal call)
    │
    ▼
Tool executor spins up container with SDK + inputs + BYOK env vars
    │
    ▼
Tool runs; may call back to Rokki (files, sampling, upload)
    │
    ▼
Tool returns output (JSON) or error
    │
    ▼
Executor reports back to MCP server
    │
    ▼
MCP server:
  - validates output vs schema
  - updates tool_invocations (status=success, duration, cost)
  - writes activity row
  - refunds quota if failure
  - returns result to user's Claude
    │
    ▼
User's Claude relays to user
```

## 6.9 Existing skill adaptation

Many tools in Zack's Anthropic skills directory can become Rokki tools. Classification:

| Skill | Portability | Notes |
|---|---|---|
| `aerial-reels` | High | API-based (Google Maps, Mapbox); clean server port |
| `condo-declaration-puller` | High | Web scraping; wrap current Python in sandbox |
| `titan-quote` | High | Image generation; uses Pillow — port cleanly |
| `market-moves-south-florida` | High | Pillow image gen; port |
| `market-moves-sf` | High | Copy gen; needs LLM → sampling-based |
| `drawing-upload-manager` | Medium | Operates on files; rework to use Rokki file API |
| `eddies-file-manager` | Medium | Same; file ops adapted to Rokki project |
| `eddies-doc-reader` | Medium | Reads + narrates docs; port narration via sampling + TTS |
| `condo-declaration` | High | Existing workflow |
| `gc-bid-creator` | High | Generates Word + Excel; runs server-side |
| `margin-corrector` | High | Pure Python module; trivial port |
| `google-maps` | High | API wrapper |
| `image-enhancer` | High | Image processing |
| `schedule` | Skip | Meta-tool for scheduling; Rokki has native scheduling |
| `consolidate-memory` | Skip | Claude-specific behavior, not user-facing |
| `skill-creator` | Skip | Meta-tool for building skills outside Rokki |
| `pdf`, `docx`, `xlsx`, `pptx` | Built-in | Provide as platform utilities in SDK, not user tools |

Porting plan:
1. Copy SKILL.md + scripts into a Rokki tool folder
2. Replace any file system operations with `@rokki/tool-sdk` file calls
3. Replace API key hardcoding with env var lookups
4. Test locally with `rokki dev` (runs local sandbox)
5. `rokki push`

## 6.10 Tool analytics

Per-tool dashboard (visible to owner):
- Invocations (daily/weekly/monthly)
- Success rate
- p50 / p95 / p99 duration
- Avg cost per invocation
- Top errors (grouped by error_code + error_message)
- Users (if permitted by visibility) — anonymized for `public` tools
- Feedback thumbs up/down with optional comment

Data sourced from `tool_invocations` + explicit user-submitted feedback.

## 6.11 Versioning & rollback

- Tool versions are immutable after publish
- Current version is what new invocations use
- To rollback: publish an older version (e.g., `POST /v1/tools/:slug/publish { version: "1.1.0" }`)
- Running invocations continue with their version; new ones use rolled-back version

Semver is required in version strings. Breaking changes should bump major; additions bump minor; fixes bump patch.

## 6.12 Tool testing (owner-side)

Before publishing, owner can:

```
rokki test ./aerial-reels --input '{"address": "123 Brickell Ave"}'
```

This runs the tool in a local sandbox and returns the output — no credit deduction, no production logging.

After push but before publish, tool is invokable only by the owner in a "preview" mode:

```
POST /v1/tools/:slug/invoke?preview=1.2.0
```

Useful for integration testing before flipping to the new version for all users.

## 6.13 Security considerations

- **Tool code is untrusted by default.** The sandbox protects Rokki.
- **User inputs can contain prompt injection.** Tools that feed inputs into LLMs must sanitize or wrap in strict system prompts.
- **File access from within tools:** tools can read files in the invoking user's context. A tool could theoretically read and exfiltrate files. Mitigations: network allowlist prevents unknown destinations; all tool file reads are logged in activity.
- **Supply-chain via npm deps:** validation strips `node_modules`; server re-installs via `package-lock.json`. Add Dependabot for the tool templates.
- **Cost attacks:** a malicious user could invoke a tool in a loop. Quotas + per-user rate limits + killswitch are the defense. Monitor `tool_invocations.cost_usd` aggregated — if any user exceeds $X/hr, page.

## 6.14 Economics

- Rokki's cost per invocation: compute (cents per hour of container), external API calls (BYOK shifts this to user), storage (small).
- Internal-only deployment: negligible cost. Phase 1 budget: < $200/mo even with heavy tool use.
- If Rokki opens up later: credits become the revenue lever; charge $X per 1000 credits.

## 6.15 Common pitfalls

- **Tools are untrusted code in a shared system.** Never skip sandbox. Never execute tool code in the main API server process.
- **The callback token scope matters.** If tools could call arbitrary Rokki endpoints with user privileges, a bad tool could drain the user's permissions. Lock the callback to a minimal allowlist of endpoints.
- **BYOK keys in environment variables are visible to `ps` and memory dumps.** Use a secrets-proxy sidecar if paranoid; for Phase 1, the short-lived per-invocation container is acceptable.
- **Sandbox startup latency (1-3s) is perceived as slow** for simple tools. Use warm pools / keep some containers pre-warmed for high-frequency tools.
- **Tool timeout != DB timeout.** A tool can hit its 120s timeout while the DB hangs. Always set DB query timeouts independently at 30s.
- **Semver bumps MUST be enforced.** A "minor" tool change with breaking input schema is a real hazard when invoked by older LLM conversations. Reject non-semver versions at push time.
- **Admin review queue can become a bottleneck.** Platform admin (you) becomes the single point of failure. For Phase 1 this is acceptable because tools are internal. Design for eventual multi-reviewer approval in Phase 2.
- **Deprecated tools still cost money** (storage, standby warm pools). Auto-archive after 30 days of no invocations.
- **Tool failures should not retry automatically on the user's behalf.** Let the LLM see the error and decide. Auto-retry turns a 1-credit failure into a 5-credit billing disaster.
- **Sampling fallback logic (§03.6) runs per-invocation.** If it's slow (checking BYOK, calling client), the user perceives tool lag. Cache BYOK lookup per session.
- **Tool input schemas are the contract with every invoking LLM.** Changing them without a version bump silently breaks integrations.
