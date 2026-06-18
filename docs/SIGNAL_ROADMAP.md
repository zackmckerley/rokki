# Signal → iMessage-class Messenger — Roadmap

**Goal:** make Signal inside Rokki a fully operational, professional messaging
suite comparable to iMessage on a Mac — instant two-way messaging, files,
reactions, the polish, and contact/conversation parity with the phone.

**Architecture recap:** Rokki links to Signal as a **secondary device** (like
Signal Desktop) via `signal-cli` running as a persistent JSON-RPC **daemon** on
a Fly.io bridge (`apps/signal-bridge`). The web app talks to the bridge over
HTTPS; messages persist in Supabase (`signal_*` tables) and stream to the UI via
Realtime. The bridge holds the signal-cli session + the service-role key.

---

## Status — what's shipped

- ✅ Link/connect flow (QR), number capture, auto-reconnect daemon
- ✅ **Instant send** (persistent daemon — no per-message JVM cold start) +
      optimistic UI (bubble appears immediately)
- ✅ Two-way **receive** — incoming messages + your own phone-sent messages
      (sync transcripts) flow into Rokki live
- ✅ **Contacts + groups sync** → names on threads + "New message" picker
- ✅ **Delete** a conversation or message (Rokki-local)

---

## The three caught issues — honest status

### 1 & 3 — Rokki sends don't appear in Signal on the phone *(REAL BUG — P1)*
Signal's multi-device model is supposed to mirror a message sent from any
linked device (Rokki) back to all your other devices (your phone) via a
**sent-transcript sync**. If your Rokki sends aren't showing up in the phone's
Signal app, `signal-cli` isn't emitting that self-sync on send. **This is
fixable** — likely a `send` flag / account config in the daemon. Top priority:
a messenger where your own sent messages don't appear everywhere is broken.

### 2 — No historical messages from before linking *(SIGNAL LIMITATION)*
Unlike iMessage (which syncs your whole archive via iCloud), Signal's linked
devices receive **nothing sent before link time** — there is no full-history
backfill in the protocol. Signal added *recent* message-history transfer to
linked **Desktop** devices in 2024; whether `signal-cli` can receive that is
**unverified**. Realistic outcome: full archive is impossible; *recent* history
may be partially recoverable — needs investigation (Phase 6). We should not
promise full history.

---

## Phase 1 — Reliability (make the basics bulletproof) — **DO FIRST**

| # | Item | signal-cli / notes |
|---|---|---|
| 1.1 | **Fix Rokki→phone self-sync** (issues #1/#3) | Ensure the daemon `send` emits the sent-transcript so the phone mirrors Rokki sends. Verify against a live send; fix flag/config. |
| 1.2 | **Message status** — sending → sent → delivered ✓✓ → read → failed | signal-cli emits `receiptMessage` (delivery + read). Map to a `status` column; show ticks; add a failed state + retry. |
| 1.3 | **Optimistic reconcile** | Replace the temp bubble with the persisted row by matching on body+timestamp so there's no flicker or duplicate. |
| 1.4 | **Mark-as-read** | Send read receipts (`sendReceipt`) when a thread is opened so the other side sees ✓✓. |
| 1.5 | **Daemon health + recovery** | `/health` already reports `rpc`; add alerting + faster reconnect + a visible "reconnecting" state in the UI. |

**Acceptance:** send from Rokki → appears on phone within seconds; delivery/read
ticks render; a failed send shows an error + retry.

## Phase 2 — Attachments & files *(explicit ask)*

| # | Item | notes |
|---|---|---|
| 2.1 | **Send files** | Attach button → upload to storage (Azure Blob / Supabase Storage) → bridge fetches the file + `signal-cli send -a <path>`. Any file type. |
| 2.2 | **Receive files** | signal-cli writes incoming attachments to disk; bridge uploads them to storage and records them in `signal_messages.attachments` (column already exists). |
| 2.3 | **Render** | Inline image/video previews, file cards (name + size + download), drag-and-drop to send, paste-to-send images. |

**Acceptance:** send a PDF + a photo from Rokki; receive an image → preview +
download; both appear on the phone too.

## Phase 3 — Rich messaging (iMessage parity)

- **3.1 Reactions** (emoji tapbacks) — `sendReaction`; `reactions` column exists.
- **3.2 Replies / quotes** — quote a specific message; `quote_external_id` exists.
- **3.3 Edit & delete-for-everyone** — Signal supports remote edit + delete;
  today our delete is Rokki-local only. `edited_at` column exists.
- **3.4 Typing indicators** — transient; show "…typing".
- **3.5 Link previews**, **@mentions** in groups, **disappearing messages**
  (respect the conversation timer).

## Phase 4 — Conversation management

- **4.1 Groups** — member list, group name/avatar, leave group.
- **4.2 Contact avatars / profile photos** (sync from signal-cli).
- **4.3 Mute / pin / archive** (`muted` column exists; add pin/archive).
- **4.4 Unread counts + badges**, **message search** (full-text on body).

## Phase 5 — Professional UX polish *(the "looks like iMessage" layer)*

- **5.1 Conversation layout** — avatars, grouped consecutive bubbles, date
  separators, hover timestamps, smooth scroll-to-bottom, sender colors in groups.
- **5.2 Composer** — multi-line, emoji picker, attachment button,
  Enter-to-send / Shift-Enter-newline.
- **5.3 Notifications** — desktop + push on new message (Rokki already has push
  infra).
- **5.4 Loading skeletons, empty states, keyboard shortcuts, light/dark parity.**

## Phase 6 — History *(hard)*

- **6.1** Investigate `signal-cli` recent-history transfer on link. Honest
  expectation: partial at best; full archive is a Signal wall.

---

## Recommended order

1. **Phase 1** — fixes the actual "it's broken" complaints (phone sync, status).
2. **Phase 2** — files, the explicit ask.
3. **Phases 3–5** — what makes it *feel* like iMessage.
4. **Phase 6** — history, last, with managed expectations.

## Cross-cutting / infra

- Attachment storage lifecycle + cleanup; size limits.
- Multi-account robustness (the account→user routing already exists).
- Send rate-limiting / backpressure.
- Privacy note (already disclosed in Connect UI): the bridge decrypts messages
  server-side while linked, so they're readable on the server.
