# 04 — Auth & Security

**Scope:** Magic link flow, session/token management, encryption (including BYOK), HTTP security headers (CSP/CORS), threat model, and emergency admin access.

## 4.1 Magic link authentication

Rokki uses **magic links only**. No passwords. Supabase Auth handles the link generation, email delivery, and verification; Rokki owns the user-facing flow and invite acceptance.

### 4.1.1 Sign-in flow

```
┌─────────┐         ┌────────────┐        ┌─────────────┐     ┌─────────┐
│  User   │         │  Rokki UI  │        │  Rokki API  │     │ Supabase│
└────┬────┘         └─────┬──────┘        └──────┬──────┘     └────┬────┘
     │  1. enter email    │                      │                 │
     │───────────────────>│                      │                 │
     │                    │  2. POST /auth/magic-link              │
     │                    │─────────────────────>│                 │
     │                    │                      │ 3. check invite │
     │                    │                      │    or existing  │
     │                    │                      │    user         │
     │                    │                      │ 4. signInWithOtp│
     │                    │                      │────────────────>│
     │                    │                      │                 │
     │                    │                      │ 5. email sent   │
     │                    │                      │<────────────────│
     │                    │  6. 200 { sent: true}│                 │
     │                    │<─────────────────────│                 │
     │  7. "check email"  │                      │                 │
     │<───────────────────│                      │                 │
     │                                                             │
     │  8. click link in email                                     │
     │─────────────────────────────────────────────────────────── >│
     │                                                             │
     │  9. redirect to app.rokki.ai/auth/callback?code=...         │
     │<────────────────────────────────────────────────────────────│
     │                    │                      │                 │
     │ 10. GET /auth/callback                                      │
     │───────────────────>│                      │                 │
     │                    │ 11. exchange code → session            │
     │                    │─────────────────────>│────────────────>│
     │                    │                      │ 12. session JWT │
     │                    │                      │<────────────────│
     │                    │ 13. set rokki_session cookie           │
     │                    │    + accept any pending invite         │
     │                    │<─────────────────────│                 │
     │ 14. redirect → target page                                  │
     │<───────────────────│                      │                 │
```

Details:

- **Magic link URL:** `https://app.rokki.ai/auth/callback?code=<otp>&redirect_to=<path>`
- **Code validity:** 15 minutes
- **One-time use:** consumed on exchange
- **Email template:** plain text with a single link. Subject: `Sign in to Rokki`. See §04.9 for templates.
- **Rate limit:** 5/min per email, 20/day per email; 10/min per IP.

### 4.1.2 Invite acceptance

If the user's email has a pending `invites` row when they sign in, the callback handler:

1. Validates the invite (not expired, not accepted, email matches)
2. Adds user to `org_members` or `project_members` with the invite's role
3. Marks `invites.accepted_at = now(), accepted_by = user.id`
4. Writes `activity` row with action `member.join`
5. Redirects to the project terminal (if project invite) or org dashboard (if org invite)

Multiple pending invites are all processed in a single transaction on first sign-in.

### 4.1.3 Session (cookie)

- **Cookie name:** `rokki_session`
- **Value:** Supabase JWT (signed, verified server-side)
- **Attributes:** `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (30 days)
- **Domain:** `.rokki.ai` (so `app.rokki.ai` and `api.rokki.ai` share it)
- **Refresh:** JWT expires in 1h; refresh token (separate cookie `rokki_refresh`, HttpOnly, Secure, SameSite=Strict) rotates every refresh
- **Logout:** clears both cookies + revokes the refresh token in Supabase

### 4.1.4 Multi-factor auth (Phase 2)

- TOTP (authenticator app) via `/settings/security`
- WebAuthn (hardware key) Phase 3
- Required for platform admins before emergency access

## 4.2 Access tokens (for AI clients)

Access tokens are the credential an external LLM client uses to talk to Rokki via MCP or REST API.

### 4.2.1 Token format

```
rk_live_<base62_22_chars>_<base62_32_chars>
```
Example: `rk_live_a1B2c3D4e5F6g7H8i9J0k1_L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7`

- `rk_live_` — prefix (env varies: `rk_live_` / `rk_test_`)
- 22-char segment — public prefix for UI display (e.g., shown as `rk_live_a1B2c3`)
- 32-char segment — secret; never displayed or logged

Total entropy: ~54 × log2(62) ≈ 322 bits. Generated via `crypto.randomBytes(40)` → base62 encode.

### 4.2.2 Storage

Plaintext is shown **once** at creation. What's stored:

- `token_hash`: `sha256(plaintext_token)` — 64-char hex
- `token_prefix`: first 12 chars (e.g., `rk_live_a1B2`) for user-facing display

Lookup is by `token_hash` (indexed, unique).

### 4.2.3 Scopes

- `read` — read-only access to the API/MCP
- `write` — create/update/delete resources
- `admin` — admin endpoints (platform admin only); Phase 2

Tokens default to `read`. Users can request `write` when creating.

### 4.2.4 Project restrictions

Tokens can be scoped to specific projects. If `project_restrictions` is set:
- All API responses exclude non-listed projects even in global endpoints
- MCP tool listings exclude tools scoped to non-listed projects
- Attempts to access non-listed projects return 404 (not 403, to avoid enumeration)

### 4.2.5 Expiry & rotation

- Default: no expiry
- Optional: 30 / 90 / 365 days
- Users rotate manually (revoke old + create new)

### 4.2.6 Revocation

Setting `revoked_at` invalidates the token immediately. Active MCP sessions are force-disconnected within 30 seconds (the MCP server re-validates the token on every 30s keep-alive ping).

## 4.3 BYOK (bring-your-own-key) encryption

Users store their own LLM provider API keys in Rokki. These require careful handling.

### 4.3.1 Threat model for BYOK

- **Attacker reads the Rokki DB:** must not be able to decrypt keys with DB access alone
- **Attacker compromises the Rokki API server:** may be able to decrypt keys in transit, but keys never persist on disk
- **Malicious Rokki employee:** must not be able to silently read a specific user's key without audit trail
- **User suspects key leaked:** revoke is one-click, takes effect immediately

### 4.3.2 Envelope encryption

Each user's API keys are encrypted with a per-user Data Encryption Key (DEK). DEKs are wrapped (encrypted) by a platform Master Key (MK) stored in Azure Key Vault.

```
User enters key:
  plaintext_key
    │
    ▼
  generate DEK (32 random bytes)
    │
    ▼
  ciphertext = AES-256-GCM(plaintext_key, DEK)
  wrapped_dek = KeyVault.wrap(DEK, MK)
    │
    ▼
  store: { ciphertext, iv, tag, wrapped_dek, key_hint }
  DEK is zeroed in memory
```

Fetching:
```
  fetch { ciphertext, iv, tag, wrapped_dek }
  DEK = KeyVault.unwrap(wrapped_dek, MK)
  plaintext = AES-256-GCM-Decrypt(ciphertext, DEK, iv, tag)
  use plaintext for API call
  zero plaintext + DEK immediately after
```

Implementation:
- `crypto.subtle` / Node `crypto` module for AES-256-GCM
- Azure Key Vault RSA-OAEP wrap for DEKs (or managed HSM-backed key)
- Unique IV per encryption (random 12 bytes)
- Auth tag stored alongside ciphertext

### 4.3.3 Access pattern

- API never returns the plaintext key after initial save
- Tool executor (§06) receives the plaintext key inline for a single tool invocation, then discards
- Every decryption logs an audit entry (`key.use` action) with actor, tool, timestamp
- User-visible: "last used" timestamp per key

### 4.3.4 Rotation

- User rotation: user generates new key at provider, updates Rokki, old key row replaced
- Platform MK rotation: annual. Re-wrap all DEKs with new MK, old MK retained for decrypt-only during rollover

## 4.4 Emergency admin access

Platform admins are not granted god-mode by default. To view a user's data, they must explicitly invoke emergency access.

### 4.4.1 Flow

1. Admin clicks "Emergency access" in admin panel for a target (user/org/project)
2. Modal requires:
   - Reason text (≥ 10 chars)
   - MFA confirmation (TOTP code)
   - Optional: notify target user (default ON)
3. Server:
   - Creates `emergency_access_events` row (started_at, admin_id, target, reason)
   - Sets `app.emergency_access = 'true'` for admin's session (session variable)
   - Sends notification to target (email + in-app) unless admin unchecked the notify box (which itself is a distinct audit event flag)
4. Admin session now passes `has_emergency_access()` check → RLS grants broad read access
5. Admin's session ends emergency access explicitly OR after 1 hour max
6. `ended_at` written; notification audit trail visible to target user

### 4.4.2 What emergency access grants

- Read access to any project/file/task
- Does NOT grant mutation privileges — admin can see but not change
- Does NOT grant access to BYOK keys (still encrypted)
- Does NOT grant access to other admins' emergency events

### 4.4.3 What target users see

On the affected user's profile:
- Banner: "A platform admin (Zack McKerley) accessed your data on 2026-04-19 14:32 UTC. Reason: [text]. [View details]"
- Details page lists specific resources viewed during the window
- Cannot be silenced or deleted by the admin

## 4.5 Tokens for service-to-service calls

Internal services (tool executor → API) use service tokens:

- Separate token pool, not in `access_tokens`
- Stored as env vars (never DB): `SERVICE_TOKEN_EXECUTOR`, etc.
- Rotated quarterly via deploy
- All service calls traced with `X-Service-Name` header for audit

## 4.6 HTTP security headers

Every response (web + API) includes:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
Content-Security-Policy: <see below>
```

Web-only (HTML responses):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://files.rokki.ai https://avatars.rokki.ai;
  font-src 'self' data:;
  connect-src 'self' https://api.rokki.ai wss://*.supabase.co;
  frame-ancestors 'none';
  form-action 'self';
  base-uri 'self';
  object-src 'none';
  upgrade-insecure-requests;
  report-to csp-endpoint;
Report-To: {"group":"csp-endpoint","max_age":10886400,"endpoints":[{"url":"https://api.rokki.ai/v1/csp-reports"}]}
```

API-only (JSON responses):
- `Cache-Control: private, no-store` for authenticated endpoints
- `X-Robots-Tag: noindex, nofollow`

## 4.7 CORS

See §02.20 for allowed origins. Additional notes:

- Preflight cached for 24h (`Access-Control-Max-Age: 86400`)
- Browser-initiated requests use session cookie; CORS must include `Access-Control-Allow-Credentials: true` for those origins
- Token-auth requests from non-browser clients (Claude Desktop MCP) are not subject to CORS; no preflight needed

## 4.8 Rate limiting implementation

- Upstash Redis (managed) for distributed rate limiting
- Fixed-window + sliding-window hybrid
- Keys: `rl:<token_id>:<bucket>:<window_start>`
- Cost: free tier covers Phase 1 easily
- Fallback: if Redis is down, fail open (log warning), do not block all requests

## 4.9 Email templates

Transactional email via Resend. Templates are plain-text-first with minimal HTML.

### 4.9.1 Magic link

```
Subject: Sign in to Rokki

Hi [name],

Click this link to sign in to Rokki:

[https://app.rokki.ai/auth/callback?code=...]

This link expires in 15 minutes and can only be used once.

If you didn't request this, you can ignore this email.

— Rokki
```

### 4.9.2 Invite

```
Subject: [Inviter] invited you to [project or org] on Rokki

Hi,

[Inviter name] invited you to join [project or org name] on Rokki.

Click here to accept:
[https://app.rokki.ai/auth/callback?code=...&invite=...]

Rokki is a project management platform. Your access is limited to [project or org], and you'll use your own Claude or ChatGPT to interact with it.

Expires in 7 days.

— Rokki
```

### 4.9.3 Emergency access notification

```
Subject: A platform admin accessed your Rokki data

Hi [name],

On [timestamp], platform admin [admin name] used emergency access to view your Rokki data.

Reason: [reason]

See full details: [link to audit page]

If this is unexpected, contact [admin email].

— Rokki
```

## 4.10 Threat model

### 4.10.1 In scope

| Threat | Mitigation |
|---|---|
| External attacker with no credentials | HTTPS only, magic link auth, rate limits |
| Credential stuffing / brute force on magic links | Rate limit per email/IP, one-time codes |
| Stolen session cookie | HttpOnly, Secure, SameSite; short JWT expiry + refresh rotation |
| Stolen access token | Scoped + expirable; revoke one-click; usage visible to user |
| SQL injection | Parameterized queries via Supabase client; no string concat |
| XSS | React auto-escapes; CSP strict; `dangerouslySetInnerHTML` forbidden except in trusted markdown renderer |
| CSRF | SameSite=Lax cookies; state-changing routes require Origin check; token auth exempts CSRF by design |
| Cross-org data leak | RLS at DB level, tested in §10 |
| Privileged user (admin) reading data silently | Emergency access required + audit + user notification |
| Malicious tool reading unauthorized data | Sandboxed execution (§06); no direct DB access; calls back via scoped API |
| Compromised BYOK key via DB breach | Envelope encryption with KMS-wrapped DEKs |
| Upload of malicious file | Virus scan (ClamAV), MIME sniff, file-type allowlist |
| Prompt injection through user-uploaded docs | RAG answers always cite sources; system prompts instruct to trust nothing but the question |

### 4.10.2 Out of scope (documented, not prevented)

| Threat | Why out of scope |
|---|---|
| Physical access to user device | Can't prevent; users responsible for device security |
| Social engineering | User training; not a software control |
| Supply chain (npm dependency compromise) | Dependabot + lockfile, but full defense requires SBOM + review not in Phase 1 |
| Zero-day in Supabase, Azure, Vercel | Trust boundary with cloud vendors |
| Prompt injection that tricks user's own LLM | User's LLM runs under their control; Rokki limits blast radius via scoped tokens |

### 4.10.3 Data classification

| Class | Examples | Controls |
|---|---|---|
| Public | Landing page, OpenAPI spec | None |
| Internal | Profile names, project names | RLS, authenticated |
| Confidential | Contracts, budgets, permits | RLS + per-file visibility |
| Secret | API keys, session tokens, webhooks secrets | Encrypted at rest, never logged |
| Emergency | Platform admin activity | Full audit trail, immutable |

### 4.10.4 Incident response

If a breach is suspected:
1. Platform admin runs `/admin/killswitch/platform` → pause all tool invocations
2. Rotate service tokens
3. Force-revoke all access tokens for affected users
4. Notify affected users within 72 hours
5. Post-incident report

## 4.11 Dependency security

- `npm audit` in CI; block merge on high/critical
- Dependabot for automated PRs
- Lockfile (`package-lock.json`) committed and verified in CI
- Production deps minimized; no transitive deep-trees for convenience libs

## 4.12 Logging discipline

- **Never log:** passwords (none), plaintext tokens, plaintext API keys, magic link codes, PII beyond user ID + email
- **Always log:** auth events (login, logout, token generate/revoke), authorization failures, emergency access, tool invocations
- **Redaction:** token logs show only prefix (e.g., `rk_live_a1B2...`), not full
- **Retention:** 30 days for request logs, 2 years for auth/security logs, forever for audit log

## 4.13 Common pitfalls

- **Session cookies must use `SameSite=Lax` not `Strict`** for the magic link flow (user clicks link in email → external origin → needs to send cookies). Strict breaks the OAuth-style redirect back to the app.
- **CSRF protection for cookie auth** relies on SameSite + origin checking. State-changing endpoints (POST/PATCH/DELETE) must verify `Origin` or `Referer` matches an allowlisted domain.
- **Token-auth endpoints don't set cookies.** Never mix cookie + Authorization in the same request flow; pick one per endpoint.
- **The service role key bypasses RLS.** It is ONLY used by: (a) the MCP server when writing to `activity` table; (b) the indexer when writing to `file_chunks`; (c) the quota decrementer; (d) the admin seed script. Every other query MUST go through an authenticated user client.
- **Emergency access timeout:** 1 hour maximum. Do not build a "stay in emergency mode" setting. The friction is the feature.
- **Magic link URLs are single-use** — if the user clicks twice, the second click fails. Send them to a friendly error page, not a stack trace.
- **BYOK keys are retrieved per-invocation,** never cached in the tool executor's memory across invocations. Long-lived cache = bigger breach surface.
- **CSP reporting should be tuned, not ignored.** First deploy will generate noise from browser extensions; filter at the report endpoint.
- **Rate limits per IP catch shared-NAT cases** (corporate office, Cloudflare Workers). Always have a per-token rate limit as the primary guard and per-IP as defense against pre-auth endpoints only.
- **"Not found" vs "forbidden":** return 404 for anything the user can't see. Return 403 only when they can see the resource but can't perform the action.
