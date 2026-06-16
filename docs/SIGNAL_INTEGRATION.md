# Signal integration — implementation instructions

**Status:** Phase 0 **shipped** — the bridge is live on Fly.io at
`https://bridge.rokki.ai` (custom domain; `https://rokki-signal-bridge.fly.dev`
also works). Phase 1 **built** — Connect
Signal lives in the Messages module settings (`/settings/modules/messages`):
linking QR flow, status, disconnect, synced-thread count, send route. Remaining
to go live: set `SIGNAL_BRIDGE_URL` + `SIGNAL_BRIDGE_SECRET` in Vercel, then link
a real account to validate the `toInbound` envelope mapping.
**Goal (Zack):** a user links their own Signal account to Rokki and can send/receive
personal messages and team messages from **either** the Signal app **or** Rokki.
Meetings + audio/video are wanted "if possible."

> [!NOTE]
> **Configuring Rokki → bridge (one-time, per environment).** The web app reaches
> the bridge through two server-only env vars: `SIGNAL_BRIDGE_URL`
> (`https://bridge.rokki.ai`) and `SIGNAL_BRIDGE_SECRET` (must equal the
> bridge's `BRIDGE_SECRET`). Set both in Vercel for **Production *and* Preview**
> — sandbox.rokki.ai builds from the `main` branch, which Vercel treats as a
> Preview environment, so Production-only vars never reach it. If they're
> blank, `/settings/modules/messages` shows a graceful "not set up yet" state
> instead of erroring. The Connect-Signal UI only ever calls our own
> `/api/v1/signal/*` routes — the secret never reaches the browser.

> [!IMPORTANT]
> **Capability reality.** Signal can be bridged for **messaging only**. The bridge
> tool (`signal-cli`) does text, attachments, voice *notes*, reactions, quotes,
> mentions, and groups — bidirectionally. It **cannot** do voice/video **calls**:
> Signal's calling is end-to-end WebRTC with no public API and no library support.
> So **meetings / video / audio *through Signal* are out of scope** — there is no
> technical path. A/V is covered as a **separate Rokki-native track** in §8.

---

## 1. What "sync Signal to Rokki" means

`signal-cli` links to your existing account exactly like **Signal Desktop** — as a
**secondary (linked) device**. Your phone stays the primary device. From the moment
of linking, the bridge sees and can send on your account. Because it's a linked
device, anything you send **from your phone app also appears in Rokki**, and anything
you send **from Rokki appears on your phone** — bidirectional is inherent, no extra
work.

- "Personal messages" = your normal 1:1 Signal chats. ✅
- "Messages to their team" = a Signal **group** (or 1:1s) with teammates **who are
  also on Signal**. ✅  *(Signal can only message Signal users. Messaging your Rokki
  team who are NOT on Signal stays in Rokki's own Messages module.)*

---

## 2. The one new piece of infrastructure

Rokki is fully serverless today (Vercel + Supabase + Cloudflare + GitHub Actions).
`signal-cli` must run **continuously** to receive messages, so this needs Rokki's
first **always-on host**.

- **Recommendation:** Fly.io (or Railway, or a small VM). ~$5/mo. Not Azure.
- Run `signal-cli` in **JSON-RPC daemon mode** (`signal-cli -a <acct> jsonRpc` /
  `daemon --http`) inside a small Node "Signal bridge" service.
- This same host can later run the MCP server, so it's not Signal-only value.

---

## 3. Architecture

```
Phone Signal app ──(linked device)──┐
                                     ▼
   Rokki web ──HTTPS──► Signal bridge service (Fly.io, always-on)
        ▲                    │  wraps signal-cli (JSON-RPC daemon)
        │                    │  - receive loop  → writes to Supabase
        │                    │  - send/commands ← called by Rokki API
        └──Supabase realtime─┘  (Messages module shows it live)
```

- **Bridge ↔ Rokki auth:** the bridge exposes an internal API protected by a shared
  service secret; per-message it acts on behalf of the owning user (account id).
- **Inbound:** bridge receive loop → normalize → insert into Supabase → Supabase
  realtime pushes to the Messages module (reuses existing realtime — no new stack).
- **Outbound:** Rokki API → bridge → `signal-cli send`.
- **Attachments:** bridge stores media via Rokki's existing file pipeline
  (Supabase Storage), runs the existing virus scan, references the blob in the
  message row.
- **MCP parity (non-negotiable):** expose Signal tools on `apps/mcp-server`
  (list threads, read, send) so the same actions work from Claude.

---

## 4. Data model (Supabase, new tables, RLS-scoped to the owner)

```sql
-- A user's linked Signal account (one per user for v1).
CREATE TABLE signal_accounts (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_number  TEXT NOT NULL,             -- the account's E.164 number
  device_id      INT,                       -- linked-device id from signal-cli
  status         TEXT NOT NULL DEFAULT 'linking', -- linking|active|error|unlinked
  -- signal-cli session/keys live on the bridge host, encrypted; we store only a
  -- reference + status here, never raw keys in the app DB.
  linked_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A Signal conversation (1:1 or group) mapped to a Rokki message thread.
CREATE TABLE signal_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id     TEXT NOT NULL,              -- recipient number OR group id
  kind          TEXT NOT NULL,              -- 'direct' | 'group'
  title         TEXT,                       -- contact name / group name
  rokki_thread_id UUID,                     -- the Messages-module thread it feeds
  terminal_id   UUID REFERENCES terminals(id), -- optional: pinned to a project (#7)
  muted         BOOLEAN NOT NULL DEFAULT false,
  sync_enabled  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, signal_id)
);

-- Signal messages reuse the existing messages table with source='signal' so they
-- flow through the Messages module unchanged. Add: source TEXT, external_id TEXT,
-- signal_thread_id UUID. (Or a dedicated signal_messages table if cleaner.)
```

RLS: every row scoped to `user_id = auth.uid()` (a Signal account + its threads +
messages are private to the owner, like a personal space).

---

## 5. Linking flow (the "sync" UX)

1. User opens Messages → **Connect Signal**.
2. Rokki calls the bridge → bridge runs `signal-cli link -n "Rokki"` → emits a
   `sgnl://linkdevice?uuid=…&pub=…` URI.
3. Rokki renders it as a **QR code** (+ copyable link).
4. User opens **Signal app → Settings → Linked Devices → Link New Device** → scans.
5. Bridge completes the link, records `device_id`, sets `status='active'`.
6. Bridge does an initial **history backfill** (linked devices receive recent
   history), then starts the receive loop.
7. Threads appear in Messages.

---

## 6. Bidirectional messaging (the core build)

Receive (bridge → Rokki): text, attachments, voice notes, reactions, quote-replies,
mentions, read/typing receipts, edits, remote-deletes, disappearing-message timers
(honor + auto-purge), group metadata.

Send (Rokki → bridge → Signal): text, attachments, reactions, quote-replies,
mentions, typing/read receipts, group actions (leave; add/remove where permitted).

"Team" routing (your "messages to their team"):
- Default: a Signal group with teammates behaves like any thread.
- Optional value-add: **"share to a Rokki space/terminal"** — surface a Signal
  message into a team thread so non-Signal teammates can see it. ⚠️ This exposes a
  personal Signal message to a team space — make it explicit + opt-in per message.

---

## 7. Phased plan

- **Phase 0 — host:** provision Fly.io, deploy the Signal bridge skeleton, prove
  `signal-cli` links and receives for one account. *(the risky, novel part)*
- **Phase 1 — receive + send text + attachments** for your own account, into the
  Messages module. End-to-end for you.
- **Phase 2 — fidelity:** reactions, quote-replies, edits, deletes, voice notes,
  groups, typing/read, disappearing timers.
- **Phase 3 — Rokki edge:** pin a thread to a Terminal, Signal-message→Task,
  unified search, MCP tools (so it works from Claude), per-thread mute/sync, notifs.

---

## 8. Meetings + audio/video — separate, Rokki-native track

Signal can't provide these (see the capability note). To get meetings + A/V chat in
Rokki, build it natively with a **WebRTC** provider — independent of Signal:

- **Recommended: LiveKit** (open-source SFU; self-host on the same always-on infra,
  or LiveKit Cloud). Handles audio rooms, video, screen-share, recording.
- Alternatives: Daily.co (fastest to embed), 100ms, Vonage. *(Avoid Twilio Video —
  it was sunset end-2024.)*
- Shape: a "Room" per terminal/meeting, join from the web app, presence + recording.
- This is its own multi-week feature with TURN servers + a media host (more cost
  than the Signal bridge). Decide separately.

A realistic "meetings" middle-ground that **does** work with Signal: post a
**meeting link** (Rokki room, Jitsi, Meet) into a Signal group from Rokki — i.e.,
schedule/announce via Signal, hold the call in Rokki's own A/V.

---

## 9. Security & privacy (decide before building)

- **E2E tradeoff:** to display Signal messages, the bridge decrypts them, so the
  bridge host holds plaintext for synced threads. This is inherent to any bridge —
  be explicit with users. Encrypt the `signal-cli` session/keys at rest on the host.
- **Unofficial:** `signal-cli` is community-maintained on Signal's libraries; a
  Signal protocol change can break it until patched. No SLA.
- **Per-user isolation:** RLS + per-user bridge sessions; never cross accounts.
- **Disappearing messages:** honor timers; don't let Rokki outlive the message.

---

## 10. Open decisions (need Zack)

1. **A/V meetings:** build the separate LiveKit track, or just post Rokki/Jitsi/Meet
   links into Signal for now?
2. **"Team messaging":** Signal-group-with-teammates only, or also the opt-in
   "share a Signal message into a Rokki space" bridge?
3. **Host:** Fly.io (recommended) vs Railway vs VM.
4. **Privacy stance on the E2E plaintext tradeoff** — acceptable for your use?
5. **Scope:** just-you first, or multi-user from the start (multi-user = one live
   `signal-cli` session per person → heavier ops)?
