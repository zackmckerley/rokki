# 07 — Realtime

**Scope:** Live updates across clients — the ticker tape, task board, file list, comments, presence, and approvals badge. Topology, subscription patterns, scaling, and failure handling.

## 7.1 What counts as realtime

Updates that must reach other clients within a few seconds:

- Task changes (status, assignee, priority, completion)
- File uploads and permission changes
- Comments (new, edited, deleted)
- Activity log entries (for the ticker)
- Approval inbox state (new requests, resolutions)
- Tool invocation status transitions (queued → running → success)
- Project member changes (invited, joined, removed)
- Presence (who's currently viewing a given screen)
- Cursors (for live cursor indicators on shared views)

Not realtime (periodic refresh is fine):
- Analytics dashboards
- Cost spend charts
- Historical audit log
- Tool marketplace listings

## 7.2 Transport choices

| Mechanism | Use |
|---|---|
| **Supabase Realtime** (Postgres change streams → WebSocket) | Task/file/comment changes, activity feed |
| **Supabase Presence** (ephemeral state over same WebSocket) | Who's viewing what; live cursors |
| **MCP SSE** (server → AI client) | Tool list changes, resource update notifications |
| **Polling** | Fallback for environments where WebSockets are blocked |

Single transport layer = fewer bugs. Supabase Realtime is the backbone for web clients.

## 7.3 Channel topology

Each client subscribes to channels based on current context. Channels are named predictably so RLS filtering works.

### 7.3.1 Channels

| Channel | Scope | Events |
|---|---|---|
| `project:<project_id>:tasks` | All tasks in a project | INSERT/UPDATE/DELETE on `tasks` where project_id = X |
| `project:<project_id>:files` | All files | Same on `files` |
| `project:<project_id>:comments` | All comments | Same on `comments` |
| `project:<project_id>:activity` | Ticker tape | INSERT on `activity` where project_id = X |
| `project:<project_id>:presence` | Who's here | Presence events only |
| `project:<project_id>:cursors` | Live cursors | Broadcast events (ephemeral) |
| `org:<org_id>:activity` | Cross-project ticker | INSERT on `activity` where org_id = X AND project_id IS NULL (rare) |
| `user:<user_id>:approvals` | Personal approval inbox | Approvals involving user |
| `user:<user_id>:invocations` | User's tool runs | tool_invocations for this user |
| `user:<user_id>:notifications` | Mentions, assignments | Broadcast events |

### 7.3.2 RLS enforcement

Supabase Realtime respects RLS: subscribers only receive rows that they'd be allowed to SELECT. This is the primary security boundary for Realtime.

Channel-level authorization (via Realtime Authorization policies) is an additional check — a user can only SUBSCRIBE to `project:X:*` if `is_project_member(X)` is true. This prevents unnecessary RLS filter overhead for non-members.

### 7.3.3 Channel lifecycle

- Client joins a channel on entering a relevant screen (e.g., opening project BRKL)
- Client unsubscribes on leaving
- Idle timeout: 60s without client acknowledgement → server drops the subscription
- Reconnect logic: client retries with exponential backoff (1s, 2s, 4s, 8s, capped at 30s)

## 7.4 Event shapes

### 7.4.1 Database-backed events

Supabase Realtime delivers:

```json
{
  "type": "postgres_changes",
  "event": "INSERT" | "UPDATE" | "DELETE",
  "schema": "public",
  "table": "tasks",
  "new": { ...row... },
  "old": { ...row... }  // UPDATE and DELETE only
}
```

Client applies to its local cache:
- INSERT → add to list
- UPDATE → merge by id
- DELETE → remove by id

### 7.4.2 Broadcast events (ephemeral)

Used for presence and cursors. Not persisted.

```json
{
  "type": "broadcast",
  "event": "cursor_move",
  "payload": {
    "user_id": "uuid",
    "x": 320, "y": 540,
    "pane": "files"
  }
}
```

Throttled client-side to 30 Hz. Ignored if > 100ms old on arrival.

### 7.4.3 Presence events

```json
{
  "type": "presence",
  "event": "sync" | "join" | "leave",
  "payload": {
    "user_id": "uuid",
    "full_name": "Carlos Martinez",
    "avatar_url": "...",
    "online_at": "2026-04-19T14:32:00Z",
    "viewing": "tasks"    // which pane they're looking at
  }
}
```

`sync` fires once on subscription with the full member list.

## 7.5 Client-side architecture

### 7.5.1 Subscription manager

Single top-level manager on the client:

```typescript
class RealtimeManager {
  private channels = new Map<string, RealtimeChannel>();
  
  join(channelName: string, handlers: EventHandlers): void;
  leave(channelName: string): void;
  leaveAll(): void;      // on logout
}
```

- Reuses existing channels if already joined (ref-counted)
- Cleans up on navigation
- Exposes connection state as a React hook (`useRealtimeStatus()`) for UI indicators

### 7.5.2 Cache updates

Realtime events update the TanStack Query cache directly:

```typescript
queryClient.setQueryData(['tasks', projectId], (old) => {
  if (event.event === 'INSERT') return [...old, event.new];
  if (event.event === 'UPDATE') return old.map(t => t.id === event.new.id ? event.new : t);
  if (event.event === 'DELETE') return old.filter(t => t.id !== event.old.id);
});
```

UI components observe the cache and re-render automatically.

### 7.5.3 Optimistic updates

User-initiated changes (create task, complete task) update the cache immediately with a temp ID. When the server INSERT comes back via Realtime, the temp row is replaced by the real row (matched by a client-generated `idempotency_key`).

If the server rejects the change, the optimistic update is rolled back and a toast explains.

## 7.6 Ticker tape implementation

The ticker at the top of every terminal shows recent activity — always moving, always current.

### 7.6.1 Data source

Subscribes to `project:<project_id>:activity` when in a project terminal, or `org:<org_id>:activity` on the dashboard.

Initial load: `GET /v1/projects/:ticker/activity?limit=50` gets the most recent 50 entries.

New events via Realtime prepend to the list.

### 7.6.2 Rendering

Horizontal marquee, CSS `animation: scroll linear infinite`.
- Items fade in from the right
- Pause on hover
- Click → navigate to the entity (task, file, etc.)
- Filter menu: all / my items / this project

Items older than 2 hours drop off the visible band (still queryable via activity log).

### 7.6.3 Rate

If events arrive faster than the ticker can scroll (> 1 per 2 seconds), skip the ticker animation for that interval and batch — show a small "N events" badge that opens the full activity feed.

## 7.7 Presence

### 7.7.1 Join

On entering a project terminal, client sends presence metadata:

```javascript
channel.track({
  user_id,
  full_name,
  avatar_url,
  viewing: 'tasks',
  joined_at: new Date().toISOString()
});
```

### 7.7.2 Update viewing context

When user switches pane (F2 → F3 → F4), client re-tracks with new `viewing`:

```javascript
channel.track({ ...prev, viewing: 'files' });
```

### 7.7.3 Leave

Automatic on tab close / navigation / network drop. Other clients see `leave` event within ~30s.

### 7.7.4 UI

Avatars row at top-right of each pane:
- Solid border: viewing this pane
- Faded: in the project but viewing a different pane
- Hover: name + last-seen
- Click: quick actions (DM, mention in comment)

## 7.8 Live cursors (Phase 2)

For collaborative views like file commenting, cursor positions broadcast:

- Throttled at 30 Hz max
- Rendered as faint outlines with a name label on pause
- Respect `prefers-reduced-motion` (cursors drawn without animation)
- Each cursor color derived from user_id hash

Scope: only in shared inline-edit contexts (comments, task detail). Not on the main terminal panes.

## 7.9 Connection state UI

### 7.9.1 States

| State | Visual | What client does |
|---|---|---|
| Connected | Green dot in status line | Normal |
| Connecting | Yellow pulse | Queue changes locally |
| Reconnecting | Orange, "Reconnecting..." | Queue, don't lose user input |
| Disconnected | Red dot, banner | Read-only mode; new changes fail with friendly error |

### 7.9.2 Reconnection strategy

1. On disconnect: set state to `Reconnecting`
2. Exponential backoff from 1s to 30s
3. On reconnect: refetch current data via REST (gets us back to a known-good state)
4. Re-subscribe to channels
5. Apply any queued local changes, handling conflicts

### 7.9.3 Stale state detection

Client tracks a `last_event_at` timestamp per subscription. If > 5 minutes without events AND the screen should have events (e.g., tasks channel with active collaborators), show a subtle "refreshing..." indicator and do a REST refetch.

## 7.10 Scaling considerations

### 7.10.1 Expected load (Phase 1)

- ~30 concurrent users
- ~10 active projects
- ~50 events/min project-wide at peak

Supabase Realtime free tier supports this easily.

### 7.10.2 Phase 2-3 scaling

At ~500 concurrent users or 1000 events/min:

- **Move to Supabase Pro** ($25/mo) — handles ~500 concurrent channels
- **Aggregate low-priority events** — don't broadcast every `activity` row individually; batch 5-10 per second per channel
- **Reduce cardinality** — instead of user-specific channels for notifications, use a single `user:<uuid>:notifications` but fan out through a server process that reads from a queue
- **Use Ably or Pusher if needed** — if Supabase Realtime can't keep up, swap the transport layer without changing event shapes

### 7.10.3 Channel count per client

A user in a project terminal subscribes to ~5 channels:
- project tasks, files, comments, activity, presence

Plus 3 user-level channels (approvals, invocations, notifications).

Total: ~8 channels per active client. Server-side: ~240 channels for 30 concurrent users.

## 7.11 MCP realtime (server → AI client)

When a user's tool access changes, the MCP server needs to inform the connected AI. Two mechanisms:

### 7.11.1 Tool list changed

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

Client re-calls `tools/list`. Server returns the updated list (reflecting new access).

### 7.11.2 Resource updated

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": { "uri": "rokki://projects/BRKL/tasks/42" }
}
```

Client re-reads the resource.

Subscriptions to `rokki://projects/BRKL/tasks` (plural) get notified on any task change in BRKL.

The MCP server subscribes to the same underlying Supabase channels and proxies relevant events to MCP sessions.

## 7.12 Failure handling

### 7.12.1 Realtime server down

- Client shows "Reconnecting…" banner
- User actions queue client-side with toasts: "Offline — will sync when reconnected"
- Periodic REST refetch every 30s keeps data fresh even without WebSocket

### 7.12.2 Out-of-order events

Postgres changes arrive in transaction commit order, but network may reorder. Client applies events optimistically; if it observes conflict (e.g., UPDATE references an id it doesn't know), it refetches from REST.

### 7.12.3 Missed events

If client's WebSocket drops for > 5 min, some events may have been missed (server doesn't buffer forever). On reconnect, client refetches all subscribed data via REST. Works because REST responses include current state.

### 7.12.4 Duplicate events

In rare cases (re-delivery), client dedupes by `(table, id, updated_at)` — if already applied, ignore.

## 7.13 Security

- Subscribers must authenticate via Supabase session JWT (same JWT used for REST)
- RLS filters row-level access per subscriber
- Channel-level authorization prevents cross-org snooping at subscribe time
- Broadcast payloads are not persisted; no audit trail for cursor moves (intentional — volume would be huge)

## 7.14 Testing

- Integration test: two client sessions, one mutates, other receives within 3s
- Load test: simulate 100 concurrent clients on 10 projects, measure event latency p95 < 1s
- Failure injection: drop WebSocket, verify reconnect within 30s and state converges

## 7.15 Common pitfalls

- **Optimistic updates without idempotency keys** cause duplicate entries when Realtime echoes back. Always tag client-initiated inserts with an `idempotency_key` and match by it.
- **Subscribing on every component mount creates thundering herds.** Lift subscriptions to top-level providers or hooks with proper memoization.
- **Presence has a cost** — each `track` call sends a broadcast. Don't call `track` on every keystroke; debounce to 1 Hz max.
- **Channel names must be predictable** — bugs where one client uses `project:<id>:tasks` and another uses `tasks:<id>:project` create silent non-sync. Always use a single named function to construct channel names.
- **Realtime does not replace REST** — first load still needs REST. Realtime is for ongoing updates, not initial data.
- **Supabase Realtime has a 100-event/channel/second limit** — if a batch operation inserts 500 tasks at once, clients may lose some. Use a single "batch completed" event instead of per-row events for bulk ops.
- **Ticker tape scrolling animation burns CPU** when left open. Pause scrolling when the tab is `document.hidden`.
- **Network changes (Wi-Fi → cellular)** drop WebSockets silently. Test reconnection on real devices, not just simulated disconnects.
- **Cursor broadcasts include user_id** — ensure no sensitive info in payloads (names are fine, emails are not).
- **Presence state is per-subscription, not per-user.** If a user has the app open in two tabs, they appear twice. Client-side dedupe by user_id before rendering.
