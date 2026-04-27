# Rokki — Build Specification

**Version:** 1.1
**Status:** Ready for implementation
**Target implementer:** Claude Code

This document is the high-level specification. The **detailed, implementation-ready specs** are in `docs/` — do not skip them. This file covers vision, design philosophy, and phase plan. The docs cover the copy-paste-ready SQL, API shapes, component specs, test plans, and acceptance criteria.

**Reading order:**
1. This file (for context)
2. `docs/00_OVERVIEW.md` (map of detailed docs)
3. Specific docs in `docs/01_*` through `docs/11_*` (the implementation details)
4. ADRs in `docs/adr/` (design rationale)

**Rule:** When this file and a detailed doc appear to conflict, the detailed doc wins. See `docs/00_OVERVIEW.md §source of truth priority`.

Do not deviate from core decisions without explicit approval from the project owner (Zack).

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Design Review & What We're Stealing From](#2-design-review--what-were-stealing-from)
3. [The Terminal Metaphor](#3-the-terminal-metaphor)
4. [Visual Design System](#4-visual-design-system)
5. [Information Architecture](#5-information-architecture)
6. [Core Screens & Flows](#6-core-screens--flows)
7. [Interaction Patterns](#7-interaction-patterns)
8. [Technical Architecture](#8-technical-architecture)
9. [Data Model](#9-data-model)
10. [API Specification](#10-api-specification)
11. [MCP Server](#11-mcp-server)
12. [Security & Permissions](#12-security--permissions)
13. [Build Phases](#13-build-phases)
14. [Quality Bar & Acceptance Criteria](#14-quality-bar--acceptance-criteria)

---

## 1. Product Vision

### 1.1 One-sentence description

Rokki is a **template-driven project management platform** where every project picks a template (general, construction, legal, product, etc.) that controls its function keys, metadata fields, and recommended roles. Every user (and their AI assistant) operates the system through a dense, keyboard-driven **Rokki Terminal** — one terminal per project — inspired by the Bloomberg Terminal's information density and the modern refinement of Linear, Superhuman, and Raycast.

The construction/real-estate template is the most-developed one because that's where Rokki was born, but the platform is fundamentally **vertical-agnostic**. A lawyer tracks cases; a product manager tracks launches; a renovator tracks builds — same terminal, different template.

### 1.2 Strategic positioning

- **Not competing with Asana, Monday, or Notion.** Those are horizontal, shallow, built for maximum approachability. Rokki is vertical, deep, built for professionals who live in their work all day.
- **Not competing with Procore.** Procore is a bloated enterprise SaaS with a UI from 2010. Rokki is what Procore should have been if it had been built in 2025 by people who respected their users' time.
- **Competing with the workflow.** Rokki's primary competition is the messy stack of email + Dropbox + phone calls + spreadsheets that professionals actually use today.

### 1.3 The $1M/month quality bar

Every design and engineering decision is evaluated against one question:

> *Would a senior professional who lives in this tool all day — a 50-year-old partner at a construction firm, a litigator preparing trial, a PM shipping a launch — look at this screen and feel that this is the most serious, most competent piece of software they've ever used?*

If the answer is no, iterate.

Non-negotiable qualities:
- **Dense, information-rich screens.** Empty space signals shallowness. Data density signals power.
- **Instant response.** Every interaction under 100ms. Perceived latency is the enemy of trust.
- **Keyboard-first.** A power user should never need a mouse. Every action has a shortcut.
- **No placeholder content.** Every pixel on screen has a reason to exist.
- **Typography that reads like a prospectus, not a blog.** Precise, tabular, confident.

### 1.4 Primary users

1. **Platform admin (Zack)** — owns everything, manages org-level settings, monitors spend, approves new tools
2. **Org members** — employees inside an org (HELIOS + eventually others). Daily driver users.
3. **Project guests** — external collaborators (architects, GCs, bankers, lenders, family). Limited scope, specific projects.
4. **AI clients** — every user's Claude, ChatGPT, or Gemini, connecting via MCP to work on their behalf.

### 1.5 Brand identity

- **Name:** Rokki
- **Domain:** `rokki.ai`
- **Wordmark:** lowercase, sans-serif, slightly geometric. No logo mark initially — the wordmark is the identity.
- **Positioning tagline:** *"The terminal for your projects."*
- **Voice:** Confident, dry, specific. Never cute, never corporate-hedged. Copy reads like Bloomberg wire headlines or a senior engineer's commit messages.

---

## 2. Design Review & What We're Stealing From

Before building, we acknowledge the masters.

### 2.1 Bloomberg Terminal — The core inspiration

**Steal:**
- Dense information display — every pixel earns its place
- Monospaced numeric data (prices, dates, IDs, figures)
- Function-key navigation (F2, F3, F4... jump to major sections)
- Command prompt that accepts typed commands: `BRKL <GO>` jumps to the Brickell project
- Multi-panel layout with independent scroll and context
- Real-time ticker at the top — live data, alerts, project events
- Amber-on-black aesthetic (we modernize this; see Design System)
- Ticker-tape moment: a horizontal stream of recent org activity

**Leave behind:**
- Ugly typography (Bloomberg typography is legacy MS-DOS era)
- Cryptic two-letter commands (we use readable commands)
- Windows 95 chrome

### 2.2 Linear — The modern refinement

**Steal:**
- Keyboard shortcuts for every action (`C` to create, `/` for search, `?` for shortcut help)
- Command palette (`⌘K`) — the universal interface
- Fast, optimistic UI — actions feel instant, sync happens in background
- Triaged issue lists with keyboard navigation (`J`/`K`)
- Status changes via inline shortcuts (`S` then `B` = status: blocked)
- Cycle views — compact, dense, readable at a glance
- The animation discipline: subtle, never gratuitous
- Inline editing — click into a title, type, done. No modals for common actions.

### 2.3 Superhuman — Email as inspiration

**Steal:**
- Everything is keyboard-driven. Mouse is a fallback, not the primary.
- Split views (inbox + reading pane) that are resizable and persistent
- Command-K search across everything
- Snoozing, scheduling, reminders — quick-access from a single key
- The "done-ness" feedback — checkmark animation, sound optional, satisfying

### 2.4 Raycast — Command palette as OS

**Steal:**
- Extensible command palette — not just search, but command execution
- Fuzzy matching that's actually good
- Rich previews inline in the palette (search a project, see its summary before opening)
- Snippet and quick-action integration

### 2.5 Notion — Flexibility without chaos

**Steal:**
- Block-based content editing (for project notes, meeting minutes, etc.)
- Slash commands (`/` to insert elements)
- Database views: table, board, calendar, timeline — all over the same data

**Leave behind:**
- Slow rendering
- Shallow permissions
- Feature sprawl

### 2.6 Figma — Real-time collaboration UX

**Steal:**
- Live cursors (you can see who else is viewing the project terminal right now)
- Presence indicators (avatars at top-right, last-seen, currently-editing)
- Inline comments with threaded replies
- Instant sync — changes appear for all viewers within milliseconds

### 2.7 Vercel Dashboard — Modern dark

**Steal:**
- Dark-first design with surgical use of color
- Monochrome charts with a single accent color for the "important" line
- Clean card-based layouts where cards have meaning (not decorative)
- Subtle borders (1px, low-contrast) to separate zones without visual noise

### 2.8 Stripe Dashboard — Data clarity

**Steal:**
- Financial-grade number formatting (tabular figures, currency alignment, percentage deltas)
- Charts that default to sensible date ranges, smart comparisons (WoW, MoM)
- Transaction-style list views (one line per event, timestamp + actor + action + delta)
- Receipts and audit trails that look like real documents

### 2.9 Arc Browser & Raycast — Novel patterns worth considering

**Steal (cautiously):**
- Command bar as primary UI element
- Spaces/Tabs in a sidebar instead of top tab bar
- Pinned + live content distinction
- Air traffic control aesthetic — lots of info, all relevant

### 2.10 Things 3 — macOS design excellence

**Steal:**
- The feeling of weight and materiality — screens feel substantial, not flimsy
- Typography at rest (in views) vs. in motion (during edit) — different modes, smooth transitions
- The cursor respects the user. Nothing surprises you.

### 2.11 GitHub — Collaboration at scale

**Steal:**
- Pull request-style review flows for approval (e.g., approving a spec change)
- @-mentions with autocomplete, email-triggering
- Inline threaded discussion anchored to specific lines/files
- Activity feeds that tell a coherent story

### 2.12 Things Rokki invents

- **The Project Terminal** — every project is its own Bloomberg-style terminal
- **AI-native everything** — every screen has an AI chat anchor; every action has an "ask the AI to do this" equivalent
- **MCP-first** — the API is the product; the UI is one client among several
- **Tool marketplace inside the PM app** — your custom skills become first-class citizens

---

## 3. The Terminal Metaphor

### 3.1 What is a "Rokki Terminal"?

A **Rokki Terminal** is a project's command center. One project = one terminal. It's the primary workspace users spend their day in.

Visually: imagine a Bloomberg Terminal modernized by Linear's typography team.

**Structure:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ROKKI  │  BRKL  │  123 Brickell Renovation  │  F2 Files  F3 Tasks...    │  ← Top bar (breadcrumb + function keys)
├─────────────────────────────────────────────────────────────────────────┤
│  [Ticker tape: "MJ uploaded A200_Rev3 • 2m ago"]                        │  ← Live activity ticker
├───────────────┬──────────────────────────────────┬──────────────────────┤
│               │                                  │                      │
│   LEFT PANE   │       MAIN PANE                  │   RIGHT PANE         │
│   (nav/list)  │       (content)                  │   (context/AI)       │
│               │                                  │                      │
│   • Tasks     │   [Task or doc or chart or...]   │   AI chat, details,  │
│   • Files     │                                  │   metadata, presence │
│   • Team      │                                  │                      │
│   • Budget    │                                  │                      │
│   • Schedule  │                                  │                      │
│               │                                  │                      │
├───────────────┴──────────────────────────────────┴──────────────────────┤
│  > command prompt...                                            ⚡ 2m ago│  ← Command bar + status line
└─────────────────────────────────────────────────────────────────────────┘
```

**Panes are:**
- **Resizable** (drag dividers; positions persist per user)
- **Swappable** (swap which pane shows which view)
- **Full-screenable** (⌘⇧F to focus one pane)
- **Closeable** (collapse right pane, go single-column for focus)

### 3.2 Function keys

Top bar shows function keys. Pressing the key (or clicking) loads that module into the main pane.

| Key | Module | Shows |
|-----|--------|-------|
| F2 | Files | Project document store |
| F3 | Tasks | Task board / list / timeline |
| F4 | Team | Members, roles, activity |
| F5 | Budget | Financials, draws, change orders |
| F6 | Schedule | Critical path, milestones, Gantt |
| F7 | Drawings | Drawing set viewer |
| F8 | Permits | Permit tracker |
| F9 | Vendors | Contractors, subs, suppliers |
| F10 | Comms | Email threads, meeting notes, calls |
| F11 | Tools | Available tools (marketplace, project-specific) |
| F12 | Audit | Full activity log |

Function keys are customizable per project type. A "Real Estate Listing" project might use F5 for Offers instead of Budget.

### 3.3 Command language

The command prompt (bottom of every terminal) accepts typed commands. This is the power-user gateway.

**Syntax:** `<TICKER> <ACTION> <ARGS>`

**Examples:**

```
BRKL GO                         → switch to Brickell project terminal
BRKL F3                         → switch to Brickell, open Tasks pane
BRKL TASK NEW "Order windows"   → create a task
BRKL FILE A200                  → open file A200 in viewer
BRKL ASK "what's the ceiling height"  → invoke AI query on project
GO HOME                         → back to dashboard
TOOL aerial-reels 123 Brickell  → invoke a tool
```

Commands are auto-completed as you type (Raycast-style).

### 3.4 The ticker tape

A horizontal scrolling bar at the top of every terminal, showing live org activity:

```
MJ uploaded A200_Rev3  •  Carlos completed Order windows  •  Loan draw #4 approved  •  Bank requested insurance cert  •  ...
```

Events:
- Clickable (jumps to the relevant item)
- Filterable (show only this project, or only my items)
- Pausable (hover to pause scroll)
- Muted per event type (don't show file uploads to me, etc.)

### 3.5 Dashboard (pre-terminal)

Before entering a specific project terminal, the user sees the dashboard — an overview across all their projects.

The dashboard itself is terminal-styled: multi-pane, dense, keyboard-driven. But instead of one project's data, it shows the cross-project view:
- **My tasks today** (across all projects)
- **Pending approvals** (tools, access requests, document reviews)
- **Recent activity** (ticker, zoomed out to all projects)
- **Projects** (list, with status indicators)
- **AI assistant** (chat anchored to the user, not a project)

---

## 4. Visual Design System

### 4.1 Color palette

**Modern Bloomberg homage: not literal amber-on-black. Use a near-black background with warm accents.**

**Dark theme (default):**

| Token | Hex | Use |
|-------|-----|-----|
| `bg-0` | `#0A0A0B` | Root background |
| `bg-1` | `#121214` | Pane background |
| `bg-2` | `#1A1A1D` | Card / inset |
| `bg-3` | `#232327` | Hover / active |
| `border` | `#2A2A2F` | Dividers, 1px |
| `border-strong` | `#3A3A42` | Focused borders |
| `text-0` | `#F5F5F7` | Primary text |
| `text-1` | `#C8C8CD` | Secondary text |
| `text-2` | `#8A8A92` | Tertiary / metadata |
| `text-3` | `#9099A4` | Subtle metadata, hints, placeholders (WCAG-AA on bg-0/bg-1) |
| `accent` | `#F5A623` | Rokki amber (the homage) — use sparingly, only for "live" / "important" / focus |
| `accent-subtle` | `#3D2E14` | Amber background tint |
| `success` | `#3FB950` | Completed, approved, on-track |
| `warning` | `#D29922` | Attention needed, close to threshold |
| `danger` | `#F85149` | Blocked, over-budget, error |
| `info` | `#58A6FF` | Links, informational |

**Light theme (secondary, still elegant):**

| Token | Hex |
|-------|-----|
| `bg-0` | `#FAFAFA` |
| `bg-1` | `#FFFFFF` |
| `bg-2` | `#F5F5F7` |
| `border` | `#E5E5E8` |
| `text-0` | `#0A0A0B` |
| `text-1` | `#2A2A2F` |
| `accent` | `#C86F00` |

Default to dark. Offer light as a setting but don't treat it as equal priority. The brand is dark.

### 4.2 Typography

**Primary UI font:** `Geist Sans` (or Inter as fallback)
- Clean, neutral, screen-optimized
- Tabular figures enabled by default for numeric columns

**Monospace (for data, IDs, numbers, code):** `Geist Mono` (or JetBrains Mono as fallback)
- Used for: file names, project tickers (BRKL), timestamps, currency, percentages, task IDs, any aligned numeric data

**Serif (rarely):** `GT Sectra` or `Source Serif Pro`, only for long-form content (meeting minutes, spec write-ups, formal docs)

**Type scale:**

| Token | Size | Weight | Line-height | Use |
|-------|------|--------|-------------|-----|
| `text-xs` | 11px | 500 | 14px | Metadata, ticker, captions |
| `text-sm` | 13px | 500 | 18px | Body, table cells, lists |
| `text-base` | 14px | 500 | 20px | Default |
| `text-md` | 15px | 500 | 22px | Emphasized body |
| `text-lg` | 17px | 600 | 24px | Section headers |
| `text-xl` | 20px | 600 | 28px | Page titles |
| `text-2xl` | 24px | 600 | 32px | Dashboard headers |
| `text-3xl` | 32px | 700 | 40px | Marketing only |

Tight letter-spacing (-0.01em) on headers. Default tracking on body.

### 4.3 Spacing

8px base grid. All spacing is a multiple of 4px.

| Token | Value | Use |
|-------|-------|-----|
| `space-0.5` | 2px | Hairline |
| `space-1` | 4px | Icon-to-text gap |
| `space-2` | 8px | Tight |
| `space-3` | 12px | Default |
| `space-4` | 16px | Comfortable |
| `space-6` | 24px | Section gap |
| `space-8` | 32px | Page margin |
| `space-12` | 48px | Large section |

### 4.4 Borders, shadows, and depth

- **Borders:** always 1px. Always `border` token or `border-strong` on focus.
- **Shadows:** minimal. Dark-mode shadows are mostly invisible; use border + slight background shift for depth instead. On light mode, shadows are `0 1px 2px rgba(0,0,0,0.04)` maximum.
- **Corner radius:** 6px for cards, 4px for inputs, 8px for modals. Never 12px+ (too soft).

### 4.5 Iconography

**Library:** Lucide Icons (consistent line-weight, professional feel)

- All icons 16px in dense UIs, 20px in large, 24px only in hero contexts
- Icon stroke: 1.5px
- Icons inherit text color by default
- Never use emoji as icons
- Never use multi-color icons (breaks the monochrome discipline)

### 4.6 Density modes

Users can toggle between three density levels:

- **Compact** — power users, matches Bloomberg density (12px text, 4px vertical padding on rows)
- **Default** — balanced (13px text, 6px padding)
- **Comfortable** — accessibility (14px text, 10px padding)

Default for new users = **Default**. Power users (detected by keyboard shortcut usage) get a prompt at day 7: "Want to try Compact mode?"

### 4.7 Motion

- **Duration:** 150ms for micro, 250ms for medium, 400ms for page-level
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` (matches Apple's default, feels crisp)
- **Never spring** except on playful actions (confetti on project completion — and even then, opt-in)
- **Reduced motion** respected via `prefers-reduced-motion`

### 4.8 Sound

**Subtle but real.** Opt-in, off by default (users enable in settings).

- `/new` — creation (task, project)
- `/complete` — completion (task done)
- `/error` — errors
- `/approve` — admin approvals
- `/notification` — task assigned

Sounds are short (~100ms), midrange, never jarring. Think Superhuman, not Slack.

### 4.9 Components

Build on **shadcn/ui** and **Radix UI primitives**, customized to the Rokki system. Required components:

**Primitives:**
- Button (4 variants: default, ghost, destructive, accent)
- Input (with inline validation, keyboard hints)
- Select / Combobox (keyboard-first, fuzzy matching)
- Checkbox, Radio, Switch
- Dialog / Modal (cmd+K summonable)
- Popover, Tooltip
- Toast (bottom-right, stackable, keyboard-dismissible)
- Tabs (keyboard arrow navigation)
- Table (virtualized for >100 rows, sortable, resizable columns, keyboard-nav)
- Dropdown menu

**Composite:**
- CommandBar (the top ticker + command prompt)
- TerminalLayout (3-pane resizable)
- ProjectCard (used in dashboard)
- TaskRow (used in task lists)
- FileCard (doc store item)
- MemberBadge (with avatar, role, presence)
- ActivityItem (ticker entry)
- AIChat (side-panel chat widget)
- ApprovalCard (inbox item)
- MetricCard (single number + delta + sparkline)
- StatusPill (colored pill for status: Planning / Active / Blocked / Done)

**Layout:**
- AppShell (top bar, function keys, main area, command bar)
- Pane (resizable wrapper)
- SplitView (horizontal/vertical split)
- EmptyState (opinionated — no cute illustrations; a concise message + primary action)

---

## 5. Information Architecture

### 5.1 Hierarchy

```
Platform (Rokki)
  └── Org (HELIOS, Architect LLC, Personal, etc.)
        └── Project (123 Brickell, 456 Coral Way, etc.)
              ├── Files
              ├── Tasks
              ├── Team (members + guests from other orgs)
              ├── Tools (available in this project)
              ├── Budget
              ├── Schedule
              ├── Audit log
              └── AI chat (scoped to this project)
```

### 5.2 Top-level navigation

- **Left rail (persistent):** Org switcher, Global nav (Dashboard, Projects, Tools, Approvals, Settings)
- **Top bar (contextual):** Current location breadcrumb, function keys, search, user menu
- **Command bar (bottom):** Always accessible. `⌘K` opens the full command palette.

### 5.3 Routes

```
/                         → Dashboard (cross-project overview)
/p/[ticker]               → Project Terminal (default view, last-used pane)
/p/[ticker]/files         → Project Files
/p/[ticker]/tasks         → Project Tasks
/p/[ticker]/team          → Project Team
/p/[ticker]/tools         → Project Tools
/p/[ticker]/budget        → Project Budget
/p/[ticker]/schedule      → Project Schedule
/p/[ticker]/audit         → Project Audit
/projects                 → All projects
/tools                    → Tool marketplace (across projects)
/approvals                → Approval inbox (admin)
/admin                    → Platform admin (super-admin only)
/settings                 → User settings (keys, profile, integrations)
/settings/keys            → API key management (BYOK)
/settings/tokens          → MCP/API tokens for external AIs
/org/[slug]/settings      → Org settings
/login                    → Magic link login
/accept/[invite_token]    → Accept invite
```

### 5.4 URL conventions

- Ticker = short uppercase code per project (e.g., `BRKL`, `CORAL`, `APTROW`). User-set or auto-generated on project creation.
- Ticker is unique per org.
- Cross-org ticker collisions resolved via scoped URL: `/p/HELIOS:BRKL` vs `/p/ARCHCO:BRKL`.

---

## 6. Core Screens & Flows

### 6.1 Login

**Philosophy:** Zero friction. Magic links only. Users type email, check inbox, one click, they're in.

**Visual:**
- Full-bleed dark background
- Centered card, 400px wide
- Rokki wordmark at top
- Single input: email
- Single button: "Send link" (accent color)
- Small helper text: "No password, no install. We'll email you a link."
- Below: "First time here? An admin needs to invite you."

**Flow:**
1. User types email → clicks Send link
2. Server checks: is this email attached to any existing user OR has an active invite?
   - **Yes, user exists:** send standard magic link
   - **Yes, invite exists:** send magic link that auto-accepts the invite
   - **No:** show friendly error: "This email isn't recognized. Contact your admin for an invite." (Avoid email enumeration: for external-facing production, make this message identical to success, but in practice for an internal tool we can be direct.)
3. User clicks link in email → token validated → session created → redirect to Dashboard (or accepted project if invite)

### 6.2 Dashboard

**Philosophy:** One glance, you know the state of your world.

**Layout (desktop):**
- Left rail: org switcher, nav
- Main area: multi-pane
  - **Top strip:** Ticker tape (cross-project activity)
  - **Left pane (30%):** My projects (list, with status pill + last activity + ticker code). Keyboard nav `J`/`K`.
  - **Center pane (40%):** My tasks today (across projects, sorted by due date, keyboard-navigable). Each row: ticker, task title, due date, project, status.
  - **Right pane (30%):** Stack of:
    - Pending approvals (if admin)
    - Unread AI suggestions
    - Calendar (next 7 days)

**Command bar at bottom:** Always accessible. Commands like `BRKL GO`, `TASK NEW`, `ASK what's on fire today`.

**Mobile:** single column, tab-switchable between Projects, Tasks, Activity.

### 6.3 Project Terminal

**Default view when opening a project.**

**Layout:**
- Top bar: org ▸ project name ▸ project ticker (monospace accent color)
- Function key row: F2-F12 with labels
- Ticker tape: project-scoped activity
- Main area: 3-pane layout (see Terminal Metaphor section)
- Bottom: command bar + status line

**Initial state** (first visit per user): F3 (Tasks) loaded in main pane, AI chat in right pane, project files summary in left pane.

**Persistent state** (subsequent visits): last-used pane configuration restored. Each user has their own saved layout per project.

### 6.4 Files view (F2)

**Layout:**
- Left: folder tree + filters (by type, by visibility, by uploader, by date)
- Main: file list (virtualized table) OR grid (thumbnail view), toggleable
- Right: selected file preview (PDF inline, image, spreadsheet, etc.) + metadata + permissions panel + AI chat about this file

**Table columns:**
- Name (monospace for filenames)
- Type (icon + label)
- Size
- Uploaded by
- Uploaded at (relative: "2m ago" with tooltip absolute)
- Visibility (pill: "All project", "Owner only", "Architect+Owner", etc.)
- Status (if applicable: "Latest", "Superseded", "Under review")

**Actions:**
- Upload: drag-drop anywhere OR paste from clipboard OR `U` keyboard shortcut
- Download: `D` or button. For external guests, downloads require download-permission.
- Preview: `Space` (like macOS QuickLook)
- Permissions: `P` opens the sharing dialog
- Rename, delete, move: standard
- Version history: inline indicator; click to see all versions

**Upload flow:**
- Small files: direct upload via API
- Large files: pre-signed URL to Azure Blob, progress bar, chunked
- On upload: AI auto-detects file type, suggests categorization ("This looks like an A-series drawing. File under Drawings?")
- Virus scan runs pre-visibility; file marked "Scanning..." until clean

### 6.5 Tasks view (F3)

**Three viewing modes (toggle `V`):**

1. **List** (Linear-style, default) — dense row list, sortable, keyboard-navigable
2. **Board** (Kanban columns by status)
3. **Timeline** (Gantt-style with dependencies)

**List columns:**
- Checkbox (complete inline)
- Ticker (monospace, clickable)
- Title
- Assignee (avatar + name)
- Due date
- Status pill
- Priority (1-4, visual indicator)
- Labels (tags)

**Keyboard:**
- `C` — create task (inline, no modal)
- `Enter` — open selected
- `A` — assign (opens picker)
- `D` — set due date
- `S` — status
- `P` — priority
- `L` — label
- `⌘Enter` — mark complete
- `/` — search within tasks

**Task detail (right pane or modal):**
- Title (editable inline)
- Description (rich text, @-mentions, file attachments)
- Assignees (can be multiple, multi-org)
- Due date, priority, status, labels
- Dependencies (blocks / blocked by)
- Comments (threaded)
- Activity log (who changed what when)
- AI chat anchored to this task

### 6.6 Team view (F4)

- List of all members + guests with access to this project
- Columns: avatar, name, role, org, last active, # tasks assigned
- Invite button (opens dialog to add by email, select project role)
- Per-member: click to see their activity on this project, assigned files, assigned tasks
- Admin can revoke access inline

### 6.7 Tools view (F11)

**Two tabs:**

1. **Available** — tools accessible to this user in this project context
2. **Marketplace** — all tools in the platform (admin view)

**Tool card:**
- Name (monospace)
- Description (2-3 lines max)
- Owner (who built it)
- Usage stats (invocations this month, success rate)
- Cost info (e.g., "~2 credits / run")
- Access badge ("You have access" / "Request access")
- "Try it" button (opens web form) + "Used by your Claude automatically"

**Tool detail page:**
- Full description
- Input schema
- Example invocations
- Version history
- Changelog
- User feedback (thumbs up/down, comments)
- "Fork this tool" (if fork is enabled)

### 6.8 Budget view (F5)

- Top row of metric cards: Total budget, Committed, Spent, Remaining, % used
- Main table: line items (cost codes), budget, committed, invoiced, paid, variance
- Sparkline charts for trend over time
- Change orders section (approve / deny inline)
- Loan draws section (for projects with financing)
- Export to Excel / PDF

### 6.9 Schedule view (F6)

- Gantt chart with critical path highlighted
- Milestones as diamonds
- Dependencies as arrows
- Today line (accent color)
- Zoomable (day, week, month, quarter)
- Drag to reschedule (with conflict detection)

### 6.10 Approvals inbox

For admins. Single screen listing:
- Tool access requests
- Per-invocation approvals (for gated tools)
- Document approval requests
- Join-project requests from external users

Keyboard-first: `J`/`K` to nav, `A` to approve, `R` to reject. Approve-with-note via `Shift+A`.

### 6.11 Admin panel

Super-admin only (you).

**Sections:**
- Users: list, search, suspend, impersonate (with audit log)
- Orgs: list, create, suspend
- Tools: all tools with usage + approval
- Spend: daily/monthly spend by tool, by user, by API provider
- Kill switches: pause a tool, pause all tools, pause a user
- Audit: global audit log (searchable, filterable)
- System: health checks, queue status, error rates

### 6.12 Settings

**Personal settings:**
- Profile (name, avatar)
- Email preferences (which notifications)
- Keyboard shortcuts (customize, view cheatsheet)
- Theme (dark / light / auto)
- Density (compact / default / comfortable)

**Keys (BYOK):**
- Anthropic: [connected ✓ / Add key]
- OpenAI: [Add key]
- Google: [Add key]
- (etc.)
- Each: masked key, last used, revoke button

**Tokens (for external AI):**
- Generate token for Claude / ChatGPT / etc.
- Scope (read-only / read-write)
- Project restrictions (all / specific list)
- Expiry (never / 90 days / 30 days)
- Show token once on creation, never again
- List of active tokens, last used, revoke

**Integrations:**
- Email (SMTP for sending on your behalf)
- Calendar (Google / Outlook sync)
- SharePoint (optional org-level connection)

---

## 7. Interaction Patterns

### 7.1 Keyboard shortcuts (global)

| Key | Action |
|-----|--------|
| `⌘K` | Command palette |
| `⌘/` | Search |
| `G D` | Go to Dashboard |
| `G P` | Go to Projects |
| `G T` | Go to Tools |
| `G S` | Go to Settings |
| `G A` | Go to Approvals |
| `?` | Show keyboard shortcut cheatsheet |
| `⌘⇧P` | Switch project |
| `⌘,` | Settings |
| `⌘\\` | Toggle right pane |
| `⌘⇧\\` | Toggle left pane |
| `⌘⇧F` | Focus current pane (full-screen) |
| `Esc` | Close modal / back to previous |

### 7.2 Command palette (`⌘K`)

Universal entry point. Categories:
- Navigate (projects, pages)
- Create (task, project, file, comment)
- Execute (tools, actions)
- Search (files, tasks, people)
- Ask AI (natural language → AI response inline)

Fuzzy matching, recent-first sorting, smart context (if inside a project, project actions rank higher).

### 7.3 AI chat integration

**Three places AI appears:**

1. **Global AI chat** — bottom-right floating button on every screen, opens a side chat. Knows your global context (all your projects, your tasks, your role).

2. **Project AI chat** — part of the Project Terminal right pane. Scoped to the current project.

3. **Inline AI** — any text field supports `⌘J` to ask AI for help (e.g., "rewrite this clearer," "summarize what I'm looking at," "what's next?").

**All three respect permissions.** AI only sees what the user sees.

**Citations always shown.** When AI answers from a document, it shows the source with a clickable reference.

### 7.4 Presence & real-time

- Avatars at top of each pane showing who else is viewing the same thing
- Live cursors in comments (Figma-style)
- Real-time sync: changes by one user appear in another's session within 500ms
- "Editing..." indicators when someone's typing in a shared field

Implementation: Supabase Realtime (Postgres change streams → WebSocket to client).

### 7.5 Empty states

No cute illustrations. No wasted screen real estate. Format:

- Short statement of what this screen would contain
- Primary action to create the first item
- Secondary: "Invite a collaborator" or "Import from..."

Example (Tasks, empty):
```
No tasks yet.
[+ Create task]   or press C
```

### 7.6 Errors

- Inline, close to where the error occurred
- Specific: "Permit file exceeded 500MB limit" not "Upload failed"
- Suggest remedy: "Split into parts or compress"
- Never lose user input on error
- Critical errors surface as toast with "View details" for stack context (but only show technical detail in admin mode)

### 7.7 Loading states

- **Skeleton screens** for predictable layouts (task list, file list) — not spinners
- **Optimistic UI** wherever possible (task creation, status changes, checkboxes)
- **Progress bars** for known-duration operations (uploads, exports)
- **Never a blank page while loading** — show the shell immediately

---

## 8. Technical Architecture

### 8.1 Stack

**Frontend (web):**
- Next.js 15 (App Router, React Server Components)
- React 19
- TypeScript (strict mode)
- Tailwind CSS
- shadcn/ui + Radix UI
- Framer Motion (sparingly)
- TanStack Query (client data)
- Zustand (client state)

**Backend:**
- Next.js API routes for most endpoints
- tRPC optional for internal typed calls
- Supabase (Postgres + auth + RLS + realtime + storage metadata)
- Azure Blob Storage (actual files)
- Resend (transactional email)
- Cloudflare (DNS, CDN, edge cache, DDoS)

**Tool execution:**
- Separate Node.js service (containerized)
- Sandboxed per-execution
- Runs on Azure Container Apps (or Fly.io for simplicity early on)

**MCP server:**
- Separate Node.js service
- Speaks MCP protocol over HTTP + SSE
- Authenticates via bearer tokens
- Hosted at `mcp.rokki.ai`

**Mobile (Phase 2):**
- Expo / React Native
- Reuses API, reuses auth

**Desktop (Phase 3):**
- Tauri (not Electron — lighter, Rust-native)

### 8.2 Services

```
┌────────────────────────────────────────────────────────┐
│                    Cloudflare (DNS + CDN)              │
└────────────────────────────────────────────────────────┘
        │
        ├── app.rokki.ai ──→ Vercel (Next.js web app)
        │
        ├── api.rokki.ai ──→ Vercel (Next.js API routes)
        │                      │
        │                      ├──→ Supabase (DB, auth, realtime)
        │                      ├──→ Azure Blob (files)
        │                      └──→ Resend (email)
        │
        ├── mcp.rokki.ai ──→ Azure Container App (MCP server)
        │                      │
        │                      └──→ same Supabase
        │
        ├── tools.rokki.ai ─→ Azure Container App (Tool executor)
        │                      │
        │                      └──→ sandboxed execution env
        │
        └── files.rokki.ai ─→ Azure Blob (via Cloudflare)
```

### 8.3 Deployment & environments

- **Local dev:** Docker Compose with local Postgres, MinIO (S3-compatible Blob stand-in), fake email
- **Staging:** separate Supabase project + Azure resource group, staging.rokki.ai
- **Production:** rokki.ai

CI/CD via GitHub Actions:
- On PR: lint, typecheck, test, preview deploy
- On merge to main: deploy to staging
- Manual promotion to production (via GitHub Actions with approval)

### 8.4 Observability

- **Logs:** structured JSON logs to Axiom (or Logflare)
- **Errors:** Sentry (frontend + backend)
- **Metrics:** Prometheus via Grafana Cloud
- **Uptime:** BetterStack
- **Analytics:** PostHog (self-hosted or cloud, product analytics + feature flags)

---

## 9. Data Model

### 9.1 Core tables

```sql
-- ORGS
CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,                    -- helios, personal, archco
  name TEXT NOT NULL,                           -- "HELIOS", "Personal"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  settings JSONB NOT NULL DEFAULT '{}'
);

-- USERS (Supabase auth.users is the source; this is profile)
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settings JSONB NOT NULL DEFAULT '{}',
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE
);

-- ORG MEMBERS
CREATE TABLE org_members (
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- PROJECTS
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,                         -- BRKL, CORAL, etc. Unique per org.
  name TEXT NOT NULL,
  description TEXT,
  type TEXT,                                    -- construction / listing / other
  status TEXT NOT NULL DEFAULT 'planning',      -- planning / active / blocked / done / archived
  metadata JSONB NOT NULL DEFAULT '{}',         -- address, folio, permit #, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  archived_at TIMESTAMPTZ,
  UNIQUE (org_id, ticker)
);

-- PROJECT MEMBERS (can include users from OTHER orgs as guests)
CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                           -- owner / manager / architect / gc / lender / family / guest
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (project_id, user_id)
);

-- TASKS
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticker_seq INT NOT NULL,                      -- auto-incrementing per project: BRKL-1, BRKL-2
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',          -- todo / in_progress / blocked / review / done
  priority INT NOT NULL DEFAULT 3,              -- 1 (urgent) to 4 (low)
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  labels TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  UNIQUE (project_id, ticker_seq)
);

CREATE TABLE task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE task_dependencies (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on),
  CHECK (task_id <> depends_on)
);

-- FILES (metadata only; actual bytes in Azure Blob)
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,                           -- /drawings/A200.pdf
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL,
  blob_url TEXT NOT NULL,                       -- azure blob key
  visibility TEXT NOT NULL DEFAULT 'project',   -- project / owners / custom
  visibility_roles TEXT[] DEFAULT '{}',         -- if visibility=custom, roles that can see
  visibility_users UUID[] DEFAULT '{}',         -- if visibility=custom, specific users
  version INT NOT NULL DEFAULT 1,
  supersedes UUID REFERENCES files(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  virus_scan_status TEXT NOT NULL DEFAULT 'pending', -- pending / clean / infected
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- COMMENTS (polymorphic: on tasks, files, etc.)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,                    -- task / file / project
  entity_id UUID NOT NULL,
  body TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id),       -- threaded
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  edited_at TIMESTAMPTZ
);

-- ACTIVITY / AUDIT LOG
CREATE TABLE activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_token_id UUID,                          -- if via AI token, which token
  action TEXT NOT NULL,                         -- file.upload, task.create, etc.
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TOOLS
CREATE TABLE tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,                           -- aerial-reels, condo-declaration
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  owner_org_id UUID NOT NULL REFERENCES orgs(id),
  visibility TEXT NOT NULL,                     -- private / org / project / public
  input_schema JSONB NOT NULL,                  -- JSON Schema for inputs
  output_schema JSONB,
  requires_provider TEXT[],                     -- ['anthropic'] if needs LLM
  approval_mode TEXT NOT NULL DEFAULT 'auto',   -- auto / one_time / per_invocation
  cost_credits INT NOT NULL DEFAULT 0,
  cost_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE (owner_org_id, slug)
);

CREATE TABLE tool_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  skill_md TEXT NOT NULL,                       -- the full SKILL.md content
  scripts JSONB NOT NULL,                       -- {filename: content}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tool_id, version)
);

CREATE TABLE tool_access (
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,                   -- user / project / org
  subject_id UUID NOT NULL,
  access_level TEXT NOT NULL,                   -- use / admin
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  PRIMARY KEY (tool_id, subject_type, subject_id)
);

CREATE TABLE tool_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES tools(id),
  tool_version_id UUID NOT NULL REFERENCES tool_versions(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  inputs_hash TEXT,                             -- hash of inputs for dedup / privacy
  status TEXT NOT NULL,                         -- queued / running / success / error / approval_required
  cost_credits INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  duration_ms INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- BYOK API KEYS (encrypted)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                       -- anthropic / openai / google / etc.
  encrypted_key TEXT NOT NULL,                  -- AES-256 encrypted
  key_hint TEXT NOT NULL,                       -- last 4 chars for UI
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- MCP/API TOKENS (for external AI clients)
CREATE TABLE access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                           -- "My Claude Desktop"
  token_hash TEXT NOT NULL UNIQUE,              -- bcrypt / sha256 hash
  scopes TEXT[] NOT NULL DEFAULT '{read}',      -- read / write / admin
  project_restrictions UUID[],                  -- null = all accessible projects
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- INVITES
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  org_id UUID REFERENCES orgs(id),
  project_id UUID REFERENCES projects(id),
  role TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id)
);

-- APPROVALS
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                           -- tool_access / tool_invocation / file_access / etc.
  requester_id UUID NOT NULL REFERENCES auth.users(id),
  approver_id UUID REFERENCES auth.users(id),
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',       -- pending / approved / denied / expired
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  note TEXT,
  context JSONB NOT NULL DEFAULT '{}'
);

-- QUOTAS
CREATE TABLE quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL,                   -- user / org
  subject_id UUID NOT NULL,
  tool_id UUID REFERENCES tools(id),
  period TEXT NOT NULL,                         -- day / month
  limit_credits INT NOT NULL,
  used_credits INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  UNIQUE (subject_type, subject_id, tool_id, period)
);
```

### 9.2 Row Level Security (RLS)

Every table has RLS enabled. Critical policies:

**projects:** users see projects where they are a member (via project_members) OR where they are a member of the org (via org_members).

**files:** users see files in projects they can see, further filtered by visibility:
- `visibility = 'project'` → any project member
- `visibility = 'owners'` → project_members with role='owner' or 'manager'
- `visibility = 'custom'` → user must be in `visibility_users` OR have a role in `visibility_roles`

**tasks:** users see tasks in projects they can see.

**tools:** users see tools that are:
- `visibility = 'public'`, OR
- `visibility = 'org'` AND they're in the org, OR
- `visibility = 'project'` AND they have access to the project, OR
- `visibility = 'private'` AND they're the owner, OR
- they have an explicit `tool_access` row

Platform admins bypass RLS **only with an emergency_access flag set in the session + audit log entry**. This is enforced by requiring admins to click "request emergency access" with a reason.

### 9.3 Indexes

Essentials:
- `projects(org_id, ticker)` — lookup by ticker
- `tasks(project_id, status)` — filter tasks by status
- `tasks(assignee)` via join on task_assignees
- `files(project_id, visibility)` — file listing
- `activity(project_id, created_at DESC)` — ticker tape
- `tool_invocations(user_id, started_at DESC)` — user usage
- `tool_invocations(tool_id, started_at DESC)` — tool analytics

---

## 10. API Specification

### 10.1 Principles

- REST over HTTPS
- JSON in/out
- Versioned: `/v1/...`
- Documented via OpenAPI 3.1 spec (auto-generated, served at `docs.rokki.ai`)
- Bearer token auth (`Authorization: Bearer <token>`)
- Rate limited per token
- All mutations return the updated resource

### 10.2 Key endpoints (not exhaustive — OpenAPI is source of truth)

```
POST   /v1/auth/magic-link              → send magic link to email
GET    /v1/me                           → current user + orgs + active token scopes

GET    /v1/orgs                         → orgs user belongs to
POST   /v1/orgs                         → create org
GET    /v1/orgs/:id                     → org detail
PATCH  /v1/orgs/:id                     → update org

GET    /v1/orgs/:id/members             → list members
POST   /v1/orgs/:id/members             → invite member (generates invite)

GET    /v1/projects                     → projects accessible to user
POST   /v1/projects                     → create project
GET    /v1/projects/:ticker             → project detail (by ticker within org context)
PATCH  /v1/projects/:ticker             → update
DELETE /v1/projects/:ticker             → archive

GET    /v1/projects/:ticker/members     → list project members + guests
POST   /v1/projects/:ticker/members     → invite to project

GET    /v1/projects/:ticker/tasks       → list tasks (filterable)
POST   /v1/projects/:ticker/tasks       → create task
GET    /v1/tasks/:id                    → task detail
PATCH  /v1/tasks/:id                    → update task
POST   /v1/tasks/:id/assignees          → assign
DELETE /v1/tasks/:id/assignees/:user_id → unassign

GET    /v1/projects/:ticker/files       → list files
POST   /v1/projects/:ticker/files       → initiate upload (small) OR get signed URL (large)
POST   /v1/projects/:ticker/files/:id/finalize  → finalize large upload
GET    /v1/files/:id                    → file metadata
GET    /v1/files/:id/download           → signed download URL
PATCH  /v1/files/:id/permissions        → change visibility

POST   /v1/projects/:ticker/search      → semantic + keyword search across project
POST   /v1/projects/:ticker/ask         → ask AI about project (RAG over files + tasks)

GET    /v1/tools                        → marketplace listing
GET    /v1/tools/:slug                  → tool detail
POST   /v1/tools                        → publish new tool (via CLI)
POST   /v1/tools/:slug/invoke           → invoke tool
GET    /v1/tools/:slug/invocations      → user's invocation history

GET    /v1/approvals                    → pending approvals (for approvers)
POST   /v1/approvals/:id/resolve        → approve or deny

GET    /v1/audit                        → audit log (filterable)

GET    /v1/me/keys                      → list BYOK keys (masked)
POST   /v1/me/keys                      → add a key
DELETE /v1/me/keys/:id                  → remove a key

GET    /v1/me/tokens                    → list access tokens
POST   /v1/me/tokens                    → create new token
DELETE /v1/me/tokens/:id                → revoke token
```

### 10.3 Response shape

```json
{
  "data": { ... } | [...],
  "meta": {
    "page": 1,
    "per_page": 50,
    "total": 123
  },
  "errors": null | [...]
}
```

### 10.4 Error codes

Use standard HTTP. Add a machine-readable `code` field:
```json
{
  "errors": [{
    "code": "quota_exceeded",
    "message": "You've used your monthly quota for this tool.",
    "details": { "resets_at": "2026-05-01" }
  }]
}
```

---

## 11. MCP Server

### 11.1 Transport

- HTTP + Server-Sent Events (SSE)
- Endpoint: `https://mcp.rokki.ai/v1/sse`
- Auth: `Authorization: Bearer <rokki_token>`

### 11.2 Tool catalog (what the user's AI sees)

At minimum, the MCP server exposes these tools (plus all user-published tools dynamically):

- `rokki_search` — natural language search across projects the user can see
- `rokki_list_projects` — list accessible projects
- `rokki_get_project` — detail for a project (ticker or id)
- `rokki_list_tasks` — list tasks with filters
- `rokki_create_task` — create task
- `rokki_update_task` — update task (status, assignee, etc.)
- `rokki_assign_task` — assign to one or more users
- `rokki_list_files` — list files in a project
- `rokki_read_file` — read a file's content (with RAG-style excerpting for large files)
- `rokki_upload_file` — upload a file (small) or get pre-signed URL (large)
- `rokki_ask_project` — RAG-style Q&A over a project's documents
- `rokki_list_members` — list project members
- `rokki_invite` — invite someone to a project (by email)
- `rokki_list_tools` — list tools available to the user
- `rokki_invoke_tool` — invoke a specific tool

Plus every user-published tool exposed dynamically with its declared schema.

### 11.3 Sampling

The MCP server supports both directions:

- Client (user's AI) calls server tools
- Server can request sampling from client — used by tools that need LLM inference without requiring BYOK

When a tool needs LLM inference:
1. Check if the user has BYOK for the required provider
2. If yes: use their API key
3. If no: try sampling via MCP client
4. If client supports sampling: use it (zero cost to you, uses their existing subscription)
5. If no sampling support: fall back to platform key (if allowed by tool config + quota not exceeded) OR return error asking for BYOK

### 11.4 Discovery

Every token-authenticated MCP session exposes:
- The base Rokki tool set
- The custom tools the user has access to (dynamically added based on `tool_access` rows)

When a user's tool access changes, the MCP session notifies the client via `tools/list_changed`.

---

## 12. Security & Permissions

### 12.1 AuthN

- Magic links (primary) via Supabase Auth
- Optional TOTP 2FA (setting)
- Optional hardware key 2FA (Phase 2)
- Session cookies: httpOnly, secure, sameSite=lax, 30-day expiry with rolling refresh
- For AI/API: bearer tokens (hashed at rest, shown once on creation)

### 12.2 AuthZ

- Row Level Security (RLS) at the DB level — the primary enforcement
- API middleware checks token validity and injects user context
- Feature flags / role checks in application layer as defense-in-depth (never rely on application layer alone for permission enforcement — RLS is the source of truth)

### 12.3 Data at rest

- Supabase: Postgres with at-rest encryption (AES-256)
- Azure Blob: default encryption at rest
- BYOK API keys: double-encrypted (envelope encryption) — KMS-wrapped DEK, unique per user

### 12.4 Data in transit

- TLS 1.3 everywhere
- HSTS preload
- Certificate pinning on mobile apps

### 12.5 Secrets management

- Vercel / Azure environment variables for service secrets
- Never committed to git
- Rotated quarterly

### 12.6 Audit

- Every privileged action logged: admin panel views, emergency access, key generations, tool publishing
- User-visible audit log on their own profile
- Org admin can see org-level audit log
- Platform admin sees global audit log (but can't hide their own actions)

### 12.7 Threat model

**In scope:**
- External attacker tries to access another user's data
- Malicious user tries to access org they're not in
- Compromised AI token tries to exfiltrate data
- Malicious tool tries to access unauthorized data
- SQL injection, XSS, CSRF (standard web vulns)

**Mitigations:**
- RLS enforces multi-tenant isolation
- Tokens are scoped (read-only by default)
- Tools run sandboxed (no network egress by default, explicit allow-list)
- Rate limiting on all endpoints
- CSP headers, output encoding, CSRF tokens
- Dependencies scanned (Dependabot)

**Out of scope (document but not prevent):**
- Social engineering
- Physical access to user devices
- Attacks on the upstream cloud providers (Azure, Supabase, Vercel) — trust boundary

### 12.8 Compliance (future)

Phase 1 is internal-only. If Rokki opens up, consider:
- SOC 2 Type I (achievable in ~6 months via Vanta/Drata)
- GDPR compliance (user data export, deletion)
- Industry-specific: potentially HIPAA equivalents if healthcare clients

---

## 13. Build Phases

### Phase 0: Foundations (Week 1)

**Goal:** Infrastructure set up, able to deploy a "hello world" page.

- [ ] Cloudflare DNS + subdomains set up
- [ ] Vercel project for web app
- [ ] Supabase project (prod + staging)
- [ ] Azure Blob storage bucket + CDN
- [ ] GitHub repo with CI (lint + typecheck on PR)
- [ ] Next.js 15 scaffolded with Tailwind, shadcn, TypeScript strict
- [ ] Design tokens as CSS variables + Tailwind config
- [ ] Geist Sans + Geist Mono loaded
- [ ] Dark theme applied
- [ ] Deploy to staging.rokki.ai — see a working Rokki wordmark

### Phase 1: Core MVP (Weeks 2–6)

**Goal:** Zack and 2-3 colleagues can use Rokki as their PM tool.

**Week 2: Auth & shell**
- [ ] Supabase magic link auth
- [ ] Session management
- [ ] AppShell layout (top bar, left rail, main, bottom command bar)
- [ ] Command palette (⌘K) — basic navigation commands
- [ ] Keyboard shortcut system (global)
- [ ] Theme toggle, density setting (in profile)

**Week 3: Orgs, projects, members**
- [ ] Create/switch orgs
- [ ] Create project (with ticker assignment)
- [ ] Project Terminal skeleton (3-pane layout, resizable)
- [ ] Invite members via email (magic link accept flow)
- [ ] Dashboard with project list

**Week 4: Tasks**
- [ ] Task data model + RLS
- [ ] List view (keyboard-navigable)
- [ ] Create, assign, update, complete
- [ ] Task detail pane
- [ ] Real-time updates (Supabase Realtime)

**Week 5: Files**
- [ ] File upload (small + large via signed URL)
- [ ] File list in terminal
- [ ] PDF preview inline
- [ ] Per-file permissions UI
- [ ] Virus scan integration (ClamAV or Defender in Azure)
- [ ] Version history

**Week 6: AI & MCP basics**
- [ ] MCP server deployed to mcp.rokki.ai
- [ ] Basic tools: search, list_projects, get_project, list_tasks, create_task, read_file
- [ ] Token generation UI in settings
- [ ] Test flow: connect Claude Desktop → ask question about project → get answer
- [ ] Global AI chat in web UI (uses same tools backing the MCP server)

**End of Phase 1:** Zack uses Rokki daily. Can invite an architect as a guest. Architect can use their Claude or the web UI.

### Phase 2: Tool marketplace (Weeks 7–10)

- [ ] Tool data model + RLS
- [ ] CLI (`rokki push`) to publish tools
- [ ] Web UI for tool marketplace
- [ ] Tool execution sandbox (Azure Container Apps)
- [ ] Access approval flow (one-time + per-invocation)
- [ ] Quotas (per-user, per-tool, credit system internal)
- [ ] BYOK API key management
- [ ] MCP sampling integration
- [ ] Port 3-5 existing skills to Rokki tools (aerial-reels, condo-declaration, etc.)

### Phase 3: Polish & mobile (Weeks 11–14)

- [ ] PWA manifest + service worker
- [ ] Offline mode basics (cached project data)
- [ ] Mobile-responsive layouts
- [ ] Push notifications (web push)
- [ ] Native mobile app (Expo) — iOS + Android
- [ ] Biometric login on mobile
- [ ] Refinement pass on typography, density, motion

### Phase 4: Depth (Weeks 15+)

- [ ] Budget module
- [ ] Schedule / Gantt module
- [ ] Drawing set viewer (annotate PDFs, compare versions)
- [ ] Permit tracker (Miami-Dade integration)
- [ ] Vendor/sub database
- [ ] Email integration (send via Rokki, track replies)
- [ ] Desktop app (Tauri)

---

## 14. Quality Bar & Acceptance Criteria

### 14.1 Every screen must

- Render in under 200ms on a mid-range laptop
- Work on keyboard alone (no mouse required for common actions)
- Respect dark theme defaults
- Handle empty, loading, error, and full states explicitly
- Display real data in development (no Lorem Ipsum committed)
- Have a `⌘K`-accessible action for its primary mutation

### 14.2 Every interaction must

- Feel instant (optimistic UI where the action is reversible)
- Respect permissions silently (if user can't do X, don't show X, don't show a toast saying "access denied" unless it's a genuine error)
- Emit an activity log entry for auditable actions

### 14.3 Every AI-facing tool must

- Have a clear, specific description (the LLM will decide when to use it based on this)
- Declare its input schema
- Return structured, citable results (not freeform text)
- Enforce permissions via the caller's token (never via client-provided user_id)
- Log the invocation

### 14.4 Definition of done for Phase 1

Zack can:
1. Log in via magic link
2. Create an org, create a project with ticker "BRKL"
3. Invite an architect (Carlos) via email → Carlos gets a magic link, accepts, sees only Brickell
4. Create tasks, assign to Carlos, set due dates
5. Upload a drawing PDF with visibility "Owners + Architects" → Carlos can see it, a hypothetical banker guest cannot
6. Connect Claude Desktop via MCP token
7. Ask Claude: "what's overdue on the Brickell project?" and get an accurate answer
8. Ask Claude: "upload this permit PDF to Brickell and mark it confidential" → it works

Carlos (architect) can:
1. Accept the invite
2. Log in
3. See only the Brickell project in his project list
4. Create a task for himself
5. Upload drawings
6. Connect his own Claude with his own token
7. Ask his Claude about Brickell → get answers limited to what he has access to
8. Ask his Claude about a different Rokki project → Claude says "I don't see that project"

### 14.5 Things that are NOT acceptable

- Pages with placeholder images / Lorem Ipsum
- Generic Tailwind "hero" sections with gradient CTAs
- Emoji in the product UI
- Marketing-style language ("Empower your team to...") anywhere in the product
- Modal overload (use inline editing for common actions)
- Loading spinners for anything that could be optimistic
- "Access Denied" errors for things that should be hidden in the first place
- Toasts for mundane actions (no "Task saved successfully" toast every time)
- Required sign-up walls (users land on login, which is obvious; no marketing gate)

---

## 15. Notes for the implementer

- Build thin vertical slices. Don't build all data models, then all APIs, then all UIs. Build one feature (e.g., tasks) end-to-end, then the next. This forces the whole stack to be exercised.
- Don't abstract prematurely. Write the concrete code, then extract shared pieces when you hit the second use case.
- Ask Zack before deviating from this spec in meaningful ways. Small decisions (variable naming, file organization) you handle. Architectural decisions (switching DBs, adding a queueing system, changing auth) need approval.
- Document architecture decisions as you go in `docs/adr/`. Each decision: context, decision, consequences, date.
- Commit small, commit often. PR-sized changes.
- Keep the `BUILD_SPEC.md` up to date as the source of truth. If reality diverges from the spec, update the spec.

---

*End of spec. Build well.*
