# ADR 0006 — Signal as a linked device via a bridge service

**Date:** 2026-06-19
**Status:** Accepted

## Context

Zack wanted to send and receive his real Signal messages from inside Rokki —
not a separate inbox, but his actual conversations, alongside the rest of the
dashboard. Signal has no public server API: the only supported way for a
third party to participate is `signal-cli`, the community CLI/daemon that
implements the protocol.

Two questions had to be answered:

1. **How does Rokki hold a Signal identity** without becoming a custodian of
   the user's primary account or their identity keys?
2. **Where does `signal-cli` run?** It needs a long-lived process, a JVM, and
   local state on disk — none of which fit Vercel's serverless model.

## Decision

**Integrate Signal as a per-user _secondary linked device_, behind a standalone
bridge service.**

- **Linked device, not primary.** Rokki links to the user's existing Signal
  account the same way Signal Desktop does — by scanning a QR
  (`sgnl://linkdevice?...`). The phone stays the primary. Rokki never holds the
  primary identity; unlinking from the phone instantly revokes Rokki's access.

- **A dedicated bridge** (`apps/signal-bridge`, a Hono app on Fly.io) runs the
  `signal-cli` JSON-RPC daemon. It is the **only** component that talks to
  Signal, and the only place that holds both the Signal session **and** the
  Supabase **service-role** key. It auto-deploys from CI on changes to
  `apps/signal-bridge/**`.

- **Server-to-server only.** The web app calls the bridge over HTTPS,
  authenticated by a shared secret (`x-bridge-secret`). Browsers never touch the
  bridge — they hit our own `/api/v1/signal/*` routes, which call the bridge
  server-side. `SIGNAL_BRIDGE_SECRET` is never shipped to the client.

- **Persistence + realtime.** Inbound/outbound messages, threads, contacts and
  account state live in `signal_*` Postgres tables with owner-only RLS;
  Supabase realtime drives live UI updates. The unified inbox lists Signal
  threads alongside native ones via `source: "signal"`.

- **One shared renderer.** Both chat surfaces — the dashboard Messages card and
  the full-page `/messages` view — render through a single component
  (`components/messages/ChatThread.tsx`, plus a shared `Lightbox`), so they
  stay pixel-identical and can't drift.

## Consequences

**Good**

- The user's identity keys never leave their phone; Rokki is a revocable,
  least-privilege linked device.
- Standard `signal-cli` — no bespoke protocol implementation to maintain.
- The bridge is the single trust boundary: one secret, one service-role key,
  one place to audit.
- Shared rendering means messaging UX improvements land on both surfaces at
  once.

**Limits (protocol, not implementation — surfaced honestly in the UI)**

- **No history backfill.** Linked devices don't receive messages sent before
  the link; threads start empty in Rokki.
- **No presence** for Signal contacts, and **no calls** (`signal-cli` can't
  place or receive them).
- Some `signal-cli` behaviours are **undocumented** and handled best-effort:
  the inbound `remoteDelete` reflection (delete-sync) and the `updateGroup`
  create-result shape (group creation). Both are flagged for live verification.

**Costs**

- A separate always-on service to operate (Fly.io), distinct from the Vercel
  web deploy.
- An IDOR risk was designed out: because the bridge bypasses RLS with the
  service-role key, `/send` re-checks that the caller owns every attachment
  `storage_key` before the bridge fetches it.

## Notes

- Bridge secrets (`SIGNAL_BRIDGE_SECRET`, `SUPABASE_*`) are set by Zack only;
  Claude never enters them. The bridge's `FLY_API_TOKEN` lives in CI.
- Never apply production migrations for `signal_*` tables without explicit
  approval.
