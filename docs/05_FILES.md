# 05 — Files

**Scope:** Upload/download flows, signed URLs, virus scanning, versioning, and RAG indexing. Covers small inline uploads, large direct-to-Blob uploads, per-file permissions, and how AI reads file content via semantic search.

## 5.1 Storage overview

- **Azure Blob Storage** for file bytes
- **Postgres `files` table** for metadata and permissions (§01.4.4)
- **Postgres `file_chunks` table** for RAG (text + embeddings)
- **Cloudflare CDN** in front of `files.rokki.ai` for download acceleration

## 5.2 Blob naming

Files are stored with opaque keys (not user filenames) to prevent path-based access:

```
{env}/{org_id}/{project_id}/{file_id}/{version}/content
```

Example: `prod/HEl105/BRKL-uuid/file-uuid/v1/content`

User-visible `filename` and `folder` live only in the DB. The blob key is never exposed to clients.

**Why not use user paths:** predictable paths are security-relevant. Opaque keys mean even if signed URL logic breaks, an attacker can't guess another file's URL.

## 5.3 Container & access config

- **Container:** `rokki-files` (private)
- **Public access:** disabled
- **Versioning at the Blob level:** enabled (defense against accidental deletion; restores possible via Azure Portal for 90 days)
- **Soft delete:** enabled, 30-day retention
- **Lifecycle:** cool tier after 90 days; archive tier after 1 year (cheaper, slower restore)
- **CORS on the Blob account:** allow `PUT`, `GET` from `https://*.rokki.ai`; no wildcard origins

## 5.4 Upload flow (small, ≤ 25 MB)

```
Client                API                 Blob              DB
  │                     │                   │                │
  │ POST /files/upload  │                   │                │
  │ (multipart)         │                   │                │
  │────────────────────>│                   │                │
  │                     │ check quotas      │                │
  │                     │ generate file_id  │                │
  │                     │ generate blob_key │                │
  │                     │ upload to blob    │                │
  │                     │──────────────────>│                │
  │                     │ <──OK─────────────│                │
  │                     │ INSERT files row (pending scan)    │
  │                     │────────────────────────────────────>│
  │                     │ <──OK───────────────────────────────│
  │                     │ kick off virus scan + indexer      │
  │                     │ (async)                            │
  │ <──201 { file }─────│                                    │
  │                                                          │
  │ (virus scan completes)                                   │
  │                     │ UPDATE virus_scan_status           │
  │                     │ notify client via Realtime         │
```

Implementation:
- Multipart body parsed via `@vercel/blob` or Node `busboy` stream
- Stream-to-blob upload (no full-buffer in memory)
- Hash computed during stream: `sha256`
- File row inserted with `virus_scan_status = 'pending'`
- Virus scan + indexer dispatched via internal queue (Azure Service Bus or simple DB polling in Phase 1)

## 5.5 Upload flow (large, > 25 MB)

Client uploads directly to Azure Blob using a short-lived SAS URL, bypassing the Rokki API server to avoid proxy overhead on large bytes.

```
Client                API                   Blob              DB
  │                    │                     │                 │
  │ POST /files/upload-url                   │                 │
  │───────────────────>│                     │                 │
  │                    │ check quotas        │                 │
  │                    │ INSERT files row    │                 │
  │                    │    (status=pending) │                 │
  │                    │─────────────────────────────────────>│
  │                    │ generate SAS URL    │                 │
  │                    │ (PUT, 15-min expiry)│                 │
  │ <─{signed_url,upload_id,headers}─│       │                 │
  │                                                            │
  │ PUT signed_url (file bytes)                                │
  │──────────────────────────────>│                           │
  │ <──201────────────────────────│                           │
  │                                                            │
  │ POST /files/{upload_id}/finalize                           │
  │ { sha256 }                                                 │
  │───────────────────>│                                      │
  │                    │ validate blob exists & size matches  │
  │                    │ update files row (status=uploaded)  │
  │                    │ kick off scan + indexer             │
  │ <─200 { file }─────│                                     │
```

SAS URL parameters:
- **Permissions:** write only
- **Expiry:** 15 minutes
- **Protocol:** HTTPS only
- **IP restriction:** optional, off by default (breaks for users on shifting IPs)
- **Content-Type:** must match declared `mime_type`

Client uses the `x-ms-blob-type: BlockBlob` header (required by Azure).

**Multipart large uploads:** for files > 100 MB, client does chunked upload using block IDs. SAS URL permits `Block List` and `Put Block` operations. Server provides initial SAS + expected block count; client assembles and calls `PutBlockList` directly. Documented in client SDK.

**Progress reporting:** client tracks bytes uploaded, displays progress bar. No server-side progress endpoint; client is authoritative.

## 5.6 Virus scan

### 5.6.1 Scanner

- **ClamAV** in a sidecar container (Azure Container App) OR Microsoft Defender for Storage
- Phase 1: ClamAV, open-source, free
- Phase 2: Defender if enterprise-tier features needed

### 5.6.2 Scan flow

1. Indexer picks up file with `virus_scan_status = 'pending'`
2. Downloads blob to ephemeral volume
3. Runs `clamscan`
4. Updates row: `clean | infected` + `virus_scan_result` text
5. On `infected`: blob is moved to a quarantine container, file row is soft-deleted, uploader notified
6. Scan log written to activity with action `file.scan_complete`

### 5.6.3 Visibility during scan

- Files with `virus_scan_status = 'pending'` are **visible in the uploader's own view** (so they see their upload completed)
- NOT visible to other project members until `clean`
- API responses include `virus_scan_status`; UI shows a "Scanning..." badge
- Download requests for pending/infected files return 423 Locked with explanation

### 5.6.4 Skipped scans

Certain MIME types bypass virus scan:
- `image/*` (jpg, png, webp, heic)
- `application/pdf` still scanned (embedded scripts possible)

Skipped files are marked `virus_scan_status = 'skipped'`.

## 5.7 Permissions

See also §01.4.4 and §01.7.8 for DB enforcement.

### 5.7.1 Visibility modes

| Mode | Who sees it |
|---|---|
| `project` | Any project member |
| `owners` | Project members with role `owner` or `manager` |
| `custom` | Users in `visibility_users` OR project role in `visibility_roles` |

### 5.7.2 Upload defaults

- Regular org members: default = `project`
- Project guests (architect, lender, etc.): default = `project` (their own role's files stay visible to their class; they can't upload `owners`-only)
- Sensitive tags (auto-detected filenames like "contract", "budget", "loan"): default = `owners`

Auto-detect is a gentle UX hint — the user can override.

### 5.7.3 Changing permissions

`PATCH /v1/files/:id/permissions` → requires uploader OR project manager:

```json
{
  "visibility": "custom",
  "visibility_roles": ["owner", "architect"],
  "visibility_users": ["user-uuid-1"]
}
```

Permission changes write `activity` with action `file.permission_change` + before/after in metadata.

### 5.7.4 Denial UX

A file that exists but the user can't see → 404 (not 403), avoid enumeration.

A file the user CAN see but can't download (e.g., download permission revoked) → 403 with explicit reason.

## 5.8 Versioning

### 5.8.1 Upload-over-file

When a user uploads a file with the same `filename` + `folder` in the same project, Rokki offers to version:

1. Client uploads, server detects name collision
2. Response: `{ "existing_file": {...}, "suggestion": "supersede" | "rename" | "abort" }`
3. Client chooses; re-submits with `supersedes: <file_id>` or a new filename
4. New file row inserted with `version = old.version + 1`, `supersedes = old.id`
5. Old file's `metadata.superseded_at` set; still accessible in version history

Alternative: client sends `supersedes` upfront → server skips the collision dance.

### 5.8.2 Version history

`GET /v1/files/:id/versions` returns all files in the supersession chain:

```json
{
  "data": [
    { "id": "v3", "version": 3, "uploaded_at": "...", "uploaded_by": "...", "sha256": "...", "current": true },
    { "id": "v2", "version": 2, "uploaded_at": "...", "current": false },
    { "id": "v1", "version": 1, "uploaded_at": "...", "current": false }
  ]
}
```

Old versions are preserved in Blob storage; lifecycle policies tier them to cool/archive after 90 days.

### 5.8.3 Current pointer

The "current" version is the one with no incoming `supersedes` reference. UI always shows current by default; toggle to see history.

## 5.9 Download

### 5.9.1 Direct download

```
GET /v1/files/:id/download
→ 302 redirect to https://files.rokki.ai/<blob_key>?<sas_signature>
```

- SAS URL: read-only, 5-minute expiry
- Response headers include `Content-Disposition: attachment; filename="..."` with the original filename

### 5.9.2 Inline view (preview)

```
GET /v1/files/:id/content
```
- For PDFs, images, text: streams content with `Content-Disposition: inline`
- For other types: returns 415 with "no inline preview available" and links to download endpoint

Range requests supported (for large PDF viewers that page-load): `Range: bytes=0-65535` → 206 Partial Content.

### 5.9.3 Download tracking

Every download writes activity with action `file.download` — actor, file, timestamp, IP (hashed). Used for audit ("did the architect download the contract?").

## 5.10 RAG indexing pipeline

Files with extractable text are indexed for semantic search. Pipeline runs async after virus scan clears.

### 5.10.1 Supported types

| MIME type | Extractor |
|---|---|
| `application/pdf` | pdf-parse (Node) or `pdftotext` (poppler) |
| `text/plain`, `text/markdown` | direct |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (docx) | mammoth |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (xlsx) | xlsx (js-xlsx) → flatten sheets to text |
| `application/vnd.openxmlformats-officedocument.presentationml.presentation` (pptx) | pptx-parser |
| `image/*` | OCR via Tesseract (Phase 2) |
| Other | skip; file is stored but not indexed |

### 5.10.2 Chunking

- Text is chunked by paragraph, then merged to ~500-token chunks (approx 400 words)
- Overlap: 50 tokens between adjacent chunks
- Metadata per chunk: `page_number` (for PDFs), `sheet_name` (for xlsx)

### 5.10.3 Embedding

- Model: `text-embedding-3-small` (1536 dim, OpenAI) — cheap and good
- Batched: up to 100 chunks per API call
- Cost: ~$0.02 per 1M tokens (very low)
- Alternative: Voyage AI `voyage-3` if multi-provider preferred

Embeddings stored in `file_chunks.embedding` (pgvector).

### 5.10.4 Indexing service

Separate Node worker process:
- Polls for files with `virus_scan_status='clean' AND NOT EXISTS (chunks)`
- OR subscribes to DB notifications via Supabase
- Processes ≤ 10 files concurrently
- Retries on transient errors, moves to dead-letter after 3 failures
- Writes chunks + embeddings
- Updates `files.metadata.indexed_at`

### 5.10.5 Search query flow

```
User query "ceiling height" in project BRKL
    │
    ▼
Embed query: vec_q (1536-dim)
    │
    ▼
SQL:
  SELECT fc.*, f.filename
  FROM file_chunks fc
  JOIN files f ON f.id = fc.file_id
  WHERE fc.project_id = $1
    AND can_see_file(f.*)            -- RLS still applies
  ORDER BY fc.embedding <=> vec_q    -- cosine distance
  LIMIT 20
    │
    ▼
Return top-k chunks with filename + page
```

RLS on `file_chunks` (via join to `files`) ensures only visible-to-user chunks return. This is critical: a user must never see chunks from files they can't access.

### 5.10.6 Reindexing

- On file permission change: no reindex needed (permissions are at `files` row)
- On content change (supersede): new file has new chunks; old file's chunks are deleted on file deletion
- On schema/model change: reindex required; batch job

## 5.11 File operations via AI

When an AI (via MCP) needs file content, it calls `rokki_read_file` (§03.4.9). Behavior:

- **Small file (< 10 KB):** full content returned
- **Large file with `query` parameter:** top chunks by cosine similarity
- **Large file without `query`:** first 10 chunks (i.e., beginning of document)

This gives the AI enough context without blowing its context window.

## 5.12 File types & MIME validation

### 5.12.1 Allowed MIME types

Allow-list (Phase 1):
- `application/pdf`
- `application/msword`, `application/vnd.openxmlformats-officedocument.*` (Office)
- `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `image/*` (jpg, png, gif, webp, heic, tiff)
- `text/*` (plain, markdown, csv)
- `application/zip` (for drawing bundles)
- `video/mp4`, `video/quicktime` (aerial reels etc.)

Disallowed:
- `application/x-msdownload` (.exe, .dll)
- `application/x-sh` (scripts)
- Any executable MIME

### 5.12.2 MIME sniffing

Never trust the client-provided Content-Type blindly. Server sniffs the file magic bytes on upload:
- Library: `file-type` npm package
- Mismatch between client MIME and sniffed MIME → reject with 422
- Unknown type → reject

### 5.12.3 Size limits

- Default: 500 MB per file
- Images: 50 MB
- Videos: 2 GB (via chunked upload)
- Per-org total storage: 50 GB on free tier (soft limit, warn at 80%)

Configurable per org.

## 5.13 Folders

- Virtual folders: stored as `folder` string on `files` row, e.g., `/drawings`, `/permits/historical`
- No separate folder table in Phase 1
- Folder "listing" = `SELECT DISTINCT folder FROM files WHERE project_id = ...`
- Rename folder = batch UPDATE files SET folder = replace(folder, 'old', 'new')
- Empty folders don't persist (no files → no entry)

Phase 2 may introduce explicit folder rows for metadata (e.g., folder-level permissions).

## 5.14 File operations summary

| Operation | Endpoint | Permissions | Notes |
|---|---|---|---|
| Upload small | `POST /v1/projects/:ticker/files/upload` | project_member | ≤ 25 MB |
| Get upload URL | `POST /v1/projects/:ticker/files/upload-url` | project_member | Large files |
| Finalize upload | `POST /v1/files/:upload_id/finalize` | uploader | After SAS upload |
| List | `GET /v1/projects/:ticker/files` | project_member | Filtered by RLS |
| Download | `GET /v1/files/:id/download` | see §5.7 | Redirect to SAS |
| Inline | `GET /v1/files/:id/content` | same | Range supported |
| Rename / move | `PATCH /v1/files/:id` | uploader/manager | Mutates filename/folder |
| Change perms | `PATCH /v1/files/:id/permissions` | uploader/manager | Writes activity |
| Soft delete | `DELETE /v1/files/:id` | uploader/manager | Retains bytes 30 days |
| Version history | `GET /v1/files/:id/versions` | same as file | Supersession chain |

## 5.15 Common pitfalls

- **Never return the Azure blob key to the client.** Always redirect through signed URLs with limited scope. If a blob key leaks, all files can be enumerated.
- **Content-Type from the client is a hint, not truth.** Sniff with `file-type` and reject mismatches.
- **PDF viewers in the browser use Range requests heavily.** Your inline endpoint MUST support `Range`, or PDFs will load one page and hang.
- **Virus scan latency (seconds) creates a UX gap.** Show "Scanning..." clearly; don't fake "uploaded" state. If users bounce because of the gap, add a "clean" webhook from ClamAV to mark instantly on completion.
- **Do NOT trust `size_bytes` from the client** in upload-url flow. After upload, query Azure for actual size and reject if mismatched.
- **Embedding cost matters at scale.** If you index GB of docs, embedding costs rise. Cap: skip chunks in documents > N pages without explicit opt-in. Large spec books might be 500 pages.
- **Deleted files' chunks must be purged** or semantic search will return references to content users can't open. Deleting a file cascades to `file_chunks`.
- **File permissions must be enforced at the chunk level via join.** Do not duplicate permission logic in an indexer; trust the DB constraint via RLS on joined query.
- **SAS URLs are fire-and-forget.** Once issued, they can't be revoked before expiry. Keep expiry short (15 min upload, 5 min download).
- **Cross-org file copies:** NOT supported in Phase 1. If an architect wants to copy a drawing from one project to another, they re-upload. Copying across orgs has permission-inheritance complexity.
- **Versioning and supersession:** the "current" file concept matters for UI. Always filter to current unless the user opts into history view. Showing all versions by default is information overload.
- **Orphan blobs (uploads that never finalize):** schedule a cleanup job to delete blobs without a corresponding `files` row older than 24h.
- **The `filename` field is user-provided and can contain unicode / spaces / special chars.** Never include it directly in URLs or shell commands. Use it only for display and Content-Disposition.
