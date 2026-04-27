# 08 — UI Design

**Scope:** Design tokens (CSS variables + Tailwind config), component specs with props, responsive breakpoints, keyboard shortcuts reference, and motion/sound specifications.

## 8.1 Design tokens (CSS variables)

Defined in `app/globals.css`. All UI values reference these.

```css
:root {
  /* Colors — dark theme (default) */
  --bg-0: #0A0A0B;
  --bg-1: #121214;
  --bg-2: #1A1A1D;
  --bg-3: #232327;
  --bg-4: #2D2D32;

  --border: #2A2A2F;
  --border-strong: #3A3A42;
  --border-focus: #F5A623;

  --text-0: #F5F5F7;
  --text-1: #C8C8CD;
  --text-2: #8A8A92;
  --text-3: #9099A4; /* WCAG-AA on bg-0/bg-1; was #5A5A62 (failed at 2.7-2.9:1) */
  --text-disabled: #3D3D44;

  --accent: #F5A623;
  --accent-hover: #FFB83D;
  --accent-active: #D48A0A;
  --accent-subtle: #3D2E14;
  --accent-subtle-hover: #4D3A1A;

  --success: #3FB950;
  --success-subtle: #0F2F18;
  --warning: #D29922;
  --warning-subtle: #3B2E0F;
  --danger: #F85149;
  --danger-subtle: #3F1515;
  --info: #58A6FF;
  --info-subtle: #102B4A;

  /* Typography */
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --font-serif: "GT Sectra", "Source Serif Pro", Georgia, serif;

  /* Type scale (px) */
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 15px;
  --text-lg: 17px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 32px;

  /* Line heights */
  --leading-xs: 14px;
  --leading-sm: 18px;
  --leading-base: 20px;
  --leading-md: 22px;
  --leading-lg: 24px;
  --leading-xl: 28px;
  --leading-2xl: 32px;
  --leading-3xl: 40px;

  /* Spacing — 4px base */
  --space-0: 0;
  --space-0_5: 2px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* Radius */
  --radius-sm: 4px;
  --radius: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Elevation (use sparingly) */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.4);

  /* Motion */
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --duration-micro: 120ms;
  --duration: 180ms;
  --duration-medium: 240ms;
  --duration-page: 360ms;

  /* Z-index */
  --z-dropdown: 1000;
  --z-sticky: 1020;
  --z-fixed: 1030;
  --z-overlay: 1040;
  --z-modal: 1050;
  --z-toast: 1060;
  --z-popover: 1070;
  --z-tooltip: 1080;

  /* Terminal-specific */
  --pane-header-height: 36px;
  --function-key-height: 32px;
  --ticker-height: 28px;
  --command-bar-height: 32px;
  --top-bar-height: 44px;
  --left-rail-width: 56px;
  --left-rail-expanded: 240px;
  --right-pane-default: 320px;
}

/* Light theme */
[data-theme="light"] {
  --bg-0: #FAFAFA;
  --bg-1: #FFFFFF;
  --bg-2: #F5F5F7;
  --bg-3: #EDEDEF;
  --bg-4: #E5E5E8;

  --border: #E5E5E8;
  --border-strong: #D1D1D5;

  --text-0: #0A0A0B;
  --text-1: #2A2A2F;
  --text-2: #5A5A62;
  --text-3: #5A6271; /* WCAG-AA on bg-0/bg-1; was #8A8A92 (failed at 3.3-3.4:1) */

  --accent: #C86F00;
  --accent-subtle: #FFF4E0;

  --success: #1A7F37;
  --warning: #9A6700;
  --danger: #CF222E;
  --info: #0969DA;
}

/* Density modes */
[data-density="compact"] {
  --row-padding-y: 4px;
  --row-font-size: 12px;
}
[data-density="default"] {
  --row-padding-y: 6px;
  --row-font-size: 13px;
}
[data-density="comfortable"] {
  --row-padding-y: 10px;
  --row-font-size: 14px;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-micro: 1ms;
    --duration: 1ms;
    --duration-medium: 1ms;
    --duration-page: 1ms;
  }
}
```

## 8.2 Tailwind configuration

`tailwind.config.ts` maps tokens to Tailwind classes:

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: {
        0: "var(--bg-0)", 1: "var(--bg-1)", 2: "var(--bg-2)",
        3: "var(--bg-3)", 4: "var(--bg-4)",
      },
      border: {
        DEFAULT: "var(--border)",
        strong: "var(--border-strong)",
        focus: "var(--border-focus)",
      },
      text: {
        0: "var(--text-0)", 1: "var(--text-1)", 2: "var(--text-2)",
        3: "var(--text-3)", disabled: "var(--text-disabled)",
      },
      accent: {
        DEFAULT: "var(--accent)",
        hover: "var(--accent-hover)",
        active: "var(--accent-active)",
        subtle: "var(--accent-subtle)",
      },
      success: { DEFAULT: "var(--success)", subtle: "var(--success-subtle)" },
      warning: { DEFAULT: "var(--warning)", subtle: "var(--warning-subtle)" },
      danger: { DEFAULT: "var(--danger)", subtle: "var(--danger-subtle)" },
      info: { DEFAULT: "var(--info)", subtle: "var(--info-subtle)" },
    },
    fontFamily: {
      sans: ["var(--font-sans)"],
      mono: ["var(--font-mono)"],
      serif: ["var(--font-serif)"],
    },
    fontSize: {
      xs: ["var(--text-xs)", { lineHeight: "var(--leading-xs)" }],
      sm: ["var(--text-sm)", { lineHeight: "var(--leading-sm)" }],
      base: ["var(--text-base)", { lineHeight: "var(--leading-base)" }],
      md: ["var(--text-md)", { lineHeight: "var(--leading-md)" }],
      lg: ["var(--text-lg)", { lineHeight: "var(--leading-lg)" }],
      xl: ["var(--text-xl)", { lineHeight: "var(--leading-xl)" }],
      "2xl": ["var(--text-2xl)", { lineHeight: "var(--leading-2xl)" }],
      "3xl": ["var(--text-3xl)", { lineHeight: "var(--leading-3xl)" }],
    },
    spacing: {
      0: "0", 0.5: "2px", 1: "4px", 2: "8px", 3: "12px", 4: "16px",
      5: "20px", 6: "24px", 8: "32px", 10: "40px", 12: "48px", 16: "64px",
    },
    borderRadius: {
      none: "0", sm: "4px", DEFAULT: "6px", md: "8px", lg: "12px", full: "9999px",
    },
    extend: {
      transitionTimingFunction: {
        DEFAULT: "var(--ease)",
      },
      transitionDuration: {
        micro: "var(--duration-micro)",
        DEFAULT: "var(--duration)",
        medium: "var(--duration-medium)",
        page: "var(--duration-page)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

## 8.3 Responsive breakpoints

```
mobile:   320 → 767    (single column, stacked panes)
tablet:   768 → 1023   (two panes, command bar at bottom)
desktop:  1024 → 1439  (three panes, terminal full experience)
wide:     1440 → 1919  (three panes, comfortable)
ultra:    1920+        (three panes, max 1680px main content width)
```

Default target: desktop. Terminal metaphor shines on ≥ 1024. Mobile collapses to single-column tabbed layout.

## 8.4 Typography rules

- Numbers (currency, dates, ticker seqs, counts): `font-variant-numeric: tabular-nums;` — always
- Monospace for: file names, project tickers, task IDs (e.g., `BRKL-42`), timestamps, code
- Serif only for: long-form content (meeting notes, spec writeups) inside a rich-text renderer
- Letter-spacing: `-0.01em` on headers (≥ text-lg); default elsewhere

## 8.5 Component specifications

Components live in `components/ui/*` (primitives) and `components/*` (composite). Built on shadcn/ui + Radix. Every component documents its props in TypeScript JSDoc.

### 8.5.1 Button

```typescript
interface ButtonProps {
  variant?: "default" | "ghost" | "destructive" | "accent";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;      // leading icon
  trailingIcon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  shortcut?: string;     // e.g., "⌘K" — shown in tooltip
  children: ReactNode;
}
```

Style:
- `default` — `bg-bg-3 hover:bg-bg-4 text-text-0 border border-border`
- `ghost` — transparent, `hover:bg-bg-2`
- `destructive` — `bg-danger/20 hover:bg-danger/30 text-danger`
- `accent` — `bg-accent hover:bg-accent-hover text-bg-0`

Sizes:
- `sm` — 24px tall, text-xs, px-2
- `md` — 32px tall, text-sm, px-3 (default)
- `lg` — 40px tall, text-base, px-4

Focus: 2px `border-focus` ring offset 1px from the border.

Loading: replace icon with spinner; keep label.

### 8.5.2 Input

```typescript
interface InputProps {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  monospace?: boolean;
  ...HTMLInputAttributes
}
```

Style: `bg-bg-2 border border-border rounded px-3 py-2 text-sm text-text-0 placeholder-text-3 focus:border-border-focus focus:outline-none`.

Error state: `border-danger`, error message below in `text-xs text-danger`.

Inline editing variant (`<Input unstyled>`): no background, expands on focus, commits on Enter or blur.

### 8.5.3 Command palette

Uses `cmdk` npm package. Mounted at app root, opens on `⌘K`.

```typescript
<CommandPalette>
  <CommandPalette.Input placeholder="Type a command…" />
  <CommandPalette.List>
    <CommandPalette.Group heading="Navigate">
      <CommandPalette.Item onSelect={...}>Dashboard</CommandPalette.Item>
      ...
    </CommandPalette.Group>
    <CommandPalette.Group heading="Projects">
      {projects.map(p => <CommandPalette.Item key={p.id}>BRKL — {p.name}</CommandPalette.Item>)}
    </CommandPalette.Group>
    <CommandPalette.Group heading="Create">
      <CommandPalette.Item shortcut="C">New task</CommandPalette.Item>
    </CommandPalette.Group>
    <CommandPalette.Group heading="Ask AI">
      <CommandPalette.Item onSelect={askAI}>Ask: "{query}"</CommandPalette.Item>
    </CommandPalette.Group>
  </CommandPalette.List>
</CommandPalette>
```

Visual:
- Centered modal, 640px wide, max-height 60vh
- `bg-bg-1` with `shadow-lg`, 1px border
- Groups separated by 1px border
- Active item: `bg-accent-subtle` + leading amber dot
- Shortcut badges: `bg-bg-3 text-text-2 px-1.5 py-0.5 rounded-sm font-mono text-xs`

### 8.5.4 TerminalLayout

The shell every project page uses.

```typescript
interface TerminalLayoutProps {
  topBar: ReactNode;          // breadcrumb + function keys
  ticker: ReactNode;          // live activity strip
  leftPane: ReactNode;
  mainPane: ReactNode;
  rightPane?: ReactNode;      // optional
  commandBar: ReactNode;      // always present
  statusLine: ReactNode;      // right-aligned info: connection, last activity
}
```

Layout:
```
┌─────────────────────────────────────────────┐  top-bar
│                 top bar                     │  44px
├─────────────────────────────────────────────┤
│                 ticker                      │  28px
├─────────────────────────────────────────────┤
│                                             │
│    [left  ][      main      ][  right ]     │  flex-1
│     30%          40%             30%        │
│                                             │
├─────────────────────────────────────────────┤
│    command bar          status              │  32px
└─────────────────────────────────────────────┘
```

Panes are resizable via `@radix-ui/react-resizable-panels`. Sizes persist per user per project in `profiles.settings`.

### 8.5.5 TaskRow

Dense, single-line task representation.

```
┌───┬──────┬──────────────────────────────────────┬──────┬──────┬──────┬─────┬──────┐
│ ☐ │ BRKL-42 │ Order impact windows              │  MC  │ May 1│ ●●○○ │ TODO │  ⋯  │
└───┴──────┴──────────────────────────────────────┴──────┴──────┴──────┴─────┴──────┘
```

Columns (left to right):
1. Checkbox (complete inline) — 32px
2. Ticker ID (monospace, hoverable → click to copy)
3. Title (flex-1, truncates, expandable on focus)
4. Assignee avatars (overlapping, max 3, "+N" badge for more)
5. Due date (red if overdue; today/tomorrow label)
6. Priority (filled/empty dots, P1-P4)
7. Status pill
8. Actions menu (opens on hover or ⋯ button)

Height: 32px (compact) / 40px (default) / 48px (comfortable)
Hover: `bg-bg-2`
Selected: `bg-bg-3` with 2px left border `border-focus`

### 8.5.6 StatusPill

```
<StatusPill status="blocked" /> → [Blocked]  (red subtle bg, red text)
<StatusPill status="done" />    → [Done]     (green subtle bg, green text)
<StatusPill status="todo" />    → [Todo]     (bg-bg-3, text-2)
```

Shape: rounded-sm, px-2 py-0.5, text-xs, uppercase, tracking-wide.

### 8.5.7 FileCard

Grid view of files.

```
┌──────────────────────────┐
│                          │
│      [file thumbnail]    │
│                          │
├──────────────────────────┤
│ A200_Rev3.pdf       v3  │
│ 84.2 MB · 2m ago        │
│ 👁 Project              │
└──────────────────────────┘
```

- 240px wide, aspect-ratio adapts by type
- Thumbnail: first page for PDF, image preview for images, generic icon otherwise
- Filename: monospace, truncated mid-string to keep extension visible
- Metadata: text-xs text-2
- Version badge: mono, accent subtle
- Visibility icon: eye with tooltip ("Visible to project members")

### 8.5.8 ActivityItem

Used in the ticker and activity feed.

```
[avatar] [actor] [action verb] [entity] [time]
MC       Carlos  uploaded      A200_Rev3  2m ago
```

Ticker variant: horizontal, 28px tall, no avatar, compact.

Feed variant: full rows, 56px tall, with avatar, expandable details (diff on updates, linked entity, actor tool if via AI).

### 8.5.9 AIChat (right pane)

```
┌─────────────────────────────────────┐
│ Ask about this project       ⨯     │  header
├─────────────────────────────────────┤
│                                     │
│  [conversation bubbles]             │  scroll
│                                     │
│  📎 Spec Sheet A-102 (pg 3)         │  citations
│                                     │
├─────────────────────────────────────┤
│ Ask or command…                ↑    │  input
└─────────────────────────────────────┘
```

- User messages: right-aligned, `bg-bg-3`, rounded-md
- AI messages: left-aligned, no bubble, plain text
- Citations: inline chip that expands on click to show excerpt
- Input: auto-growing textarea, `⌘Enter` submit
- Streaming: tokens appear letter-by-letter; cursor blink at end until `done` event

### 8.5.10 Toast

Bottom-right stack.

```typescript
toast({
  title: "Task created",
  description: "BRKL-43 · Order impact windows",
  variant: "success" | "default" | "destructive",
  action?: { label: "View", onClick: () => ... },
  duration?: 4000
});
```

Visual:
- `bg-bg-2` with 1px border
- 320px wide, auto-height up to 120px
- Slide in from right, fade out after duration
- Dismissible with × or `Esc`

### 8.5.11 Empty state

```
[small subdued illustration or nothing]
No tasks yet.
[+ Create task]  (primary button)
or press C
```

No cute illustrations. At most a single monochrome icon (24px, text-2).

## 8.6 Keyboard shortcuts

### 8.6.1 Global

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘/` | Focus search input |
| `G` then `D` | Go to Dashboard |
| `G` then `P` | Go to Projects list |
| `G` then `T` | Go to Tools |
| `G` then `A` | Go to Approvals |
| `G` then `S` | Go to Settings |
| `⌘⇧P` | Quick-switch project (fuzzy) |
| `⌘,` | Open settings |
| `?` | Show keyboard shortcut cheatsheet |
| `Esc` | Close modal / dismiss / back out |
| `⌘⇧L` | Toggle dark/light theme |
| `⌘⇧D` | Toggle density mode |

### 8.6.2 Terminal navigation (inside a project)

| Key | Action |
|---|---|
| `F2` - `F12` | Function-key panels |
| `⌘\\` | Toggle right pane |
| `⌘⇧\\` | Toggle left pane |
| `⌘⇧F` | Full-screen current pane |
| `⌘1` - `⌘9` | Switch to last N projects (MRU) |
| `[` | Previous tab / pane |
| `]` | Next tab / pane |

### 8.6.3 Task list

| Key | Action |
|---|---|
| `J` | Next task |
| `K` | Previous task |
| `Enter` | Open selected task |
| `Space` | Preview (quick-look) |
| `C` | Create new task inline |
| `A` | Assign (open picker) |
| `D` | Set due date |
| `S` then status letter | Status (T=todo, I=in_progress, B=blocked, R=review, D=done) |
| `P` then `1-4` | Priority |
| `L` | Add label |
| `⌘Enter` | Mark complete |
| `⌘Backspace` | Delete |
| `/` | Search within list |

### 8.6.4 Files

| Key | Action |
|---|---|
| `U` | Upload file |
| `Space` | Quick-look preview |
| `Enter` | Open file |
| `P` | Permissions dialog |
| `R` | Rename |
| `D` or `⌘D` | Download |
| `⌫` | Delete (soft) |
| `V` | Toggle view (list / grid) |

### 8.6.5 AI chat

| Key | Action |
|---|---|
| `⌘J` | Toggle AI chat panel |
| `⌘Enter` | Send message |
| `⇧Enter` | New line |
| `⌘L` | Clear chat |
| `⌘↑` | Previous message (edit) |

### 8.6.6 Command bar syntax

Type in the command bar (bottom of terminal) to execute:

```
BRKL GO                          Switch to BRKL project
BRKL F3                          Open BRKL tasks
BRKL TASK "buy windows"          Create task in BRKL
BRKL ASK "overdue items?"        Ask AI about BRKL
GO HOME                          Dashboard
GO TOOLS                         Tool marketplace
TOOL aerial-reels 123 Brickell   Invoke tool
```

Tokens are separated by spaces; quotes for multi-word args. Tab-completes as you type.

## 8.7 Icons

Library: **Lucide** (`lucide-react`).

Rules:
- 16px default, 20px large, 24px hero-only
- Stroke-width: 1.5
- Never emoji
- Never multi-color

Common icon mappings (for consistency):
| Entity | Icon |
|---|---|
| Task | `CheckSquare` |
| File | `FileText` |
| Project | `FolderGit2` |
| Org | `Building2` |
| User | `User` |
| Admin | `Shield` |
| Tool | `Wrench` |
| Approval | `ShieldCheck` |
| Ticker event | `Activity` |
| Search | `Search` |
| Plus | `Plus` |
| Settings | `Settings` |
| AI | `Sparkles` |
| Upload | `Upload` |
| Download | `Download` |
| Lock / private | `Lock` |

## 8.8 Motion

- Micro (hover, focus, button state): 120ms
- Standard (dropdowns, tooltips, toasts): 180ms
- Medium (sheet open, modal): 240ms
- Page transitions: 360ms (fade + slide 8px)

Easing: `cubic-bezier(0.2, 0, 0, 1)` — matches Apple Materials, feels crisp.

No spring animations except:
- Confetti on project completion (opt-in, off by default)
- Success checkmark on complete (single small bounce, can be disabled)

Reduced-motion mode: all animations → 1ms instant.

## 8.9 Sound

Off by default. Users opt in via settings. Sources: purchased sound library or synthesized on build.

| Sound | When | Volume |
|---|---|---|
| `tick.wav` (80ms) | Task checked | -20dB |
| `ding.wav` (200ms) | Success (save, complete) | -18dB |
| `error.wav` (180ms) | Error toast | -18dB |
| `notify.wav` (250ms) | Push / assignment | -15dB |
| `approve.wav` (300ms) | Admin approves | -15dB |

All sounds short (< 300ms), mid-frequency, rounded (no clicks/pops). Test: playing 100× in a row should not annoy.

## 8.10 Accessibility

- Every interactive element has an accessible name (aria-label or visible text)
- Focus ring visible on all focusable elements (`border-focus` 2px offset)
- Color-coding never the only signal — status pills include text labels, priority uses dots + numeric
- Tab order follows visual order
- Skip-to-content link at top of every page
- Semantic HTML (`<nav>`, `<main>`, `<button>`, `<table>`) — not divs-as-buttons
- ARIA live regions for toasts and ticker updates
- Minimum contrast: WCAG AA (4.5:1 for body text, 3:1 for large)
- Dark theme verified against contrast tools; accent on dark bg passes AA for non-body text

### 8.10.1 Text contrast measurements

Computed using the WCAG 2.1 relative-luminance formula. Both themes pass
AA (≥ 4.5:1) for all body-text token combinations. Large-text threshold
(≥ 3:1) applies to text ≥ 18px or ≥ 14px bold; every dark-theme `text-2`
combination clears that bar even where it's below body-text AA.

#### Dark theme — current

| Token | Hex | vs `bg-0` `#0A0A0B` | vs `bg-1` `#121214` | vs `bg-2` `#1A1A1D` | AA |
| --- | --- | --- | --- | --- | --- |
| `text-0` | `#F5F5F7` | 18.18:1 | 17.18:1 | 15.95:1 | PASS |
| `text-1` | `#C8C8CD` | 11.87:1 | 11.23:1 | 10.42:1 | PASS |
| `text-2` | `#8A8A92` | 5.78:1 | 5.46:1 | 5.07:1 | PASS |
| `text-3` | `#9099A4` | **6.86:1** | **6.49:1** | **6.02:1** | **PASS** |
| `text-disabled` | `#3D3D44` | 1.84:1 | 1.74:1 | 1.61:1 | non-text only |

`text-3` was previously `#5A5A62` and failed AA at 2.74-2.90:1 against
`bg-0`/`bg-1` (keyboard-a11y agent measurement, 2026-04). Bumping it to
`#9099A4` lifts every body-text usage above 6:1.

#### Light theme — current

| Token | Hex | vs `bg-0` `#FAFAFA` | vs `bg-1` `#FFFFFF` | vs `bg-2` `#F5F5F7` | AA |
| --- | --- | --- | --- | --- | --- |
| `text-0` | `#0A0A0B` | 18.96:1 | 19.79:1 | 18.18:1 | PASS |
| `text-1` | `#2A2A2F` | 13.68:1 | 14.28:1 | 13.11:1 | PASS |
| `text-2` | `#5A5A62` | 6.55:1 | 6.83:1 | 6.27:1 | PASS |
| `text-3` | `#5A6271` | **5.88:1** | **6.14:1** | **5.64:1** | **PASS** |
| `text-disabled` | `#C8C8CD` | 1.60:1 | 1.67:1 | 1.53:1 | non-text only |

`text-3` was previously `#8A8A92` and failed AA at 3.28-3.43:1. Darkened
to `#5A6271` to match the new dark-theme stance: secondary metadata is
fully readable, not just a hint.

## 8.11 Mobile adaptations

- Left rail collapses to bottom tab bar
- Panes stack vertically (swipe between them)
- Function keys become a scrollable chip row
- Command bar becomes a floating button → full-screen input
- Keyboard shortcuts hidden; gestures added (swipe-to-complete, long-press menu)
- Touch targets minimum 44×44px
- Bottom-safe area padded for home indicator
- Pinch-zoom on file previews

## 8.12 Implementation notes

- All components use CVA (class-variance-authority) for variant management
- Avoid runtime theme switching with JS — use CSS variables + `data-theme` on `html`
- SSR-safe: initial theme read from `Cookie: rokki_theme=dark` then hydration doesn't flicker
- Avoid Tailwind arbitrary values (`text-[15.5px]`) — add to the theme scale instead
- Icon imports via named specifiers: `import { CheckSquare } from "lucide-react";` (tree-shakable)
- Font loading via `next/font` for zero layout shift

## 8.13 Storybook (recommended)

Each component has a Storybook story showing:
- Default state
- Loading state (where applicable)
- Disabled state
- Error state (where applicable)
- All variants and sizes

Stories serve as a visual regression test target via Chromatic or Percy.

## 8.14 Common pitfalls

- **Never use `text-[15px]` or other arbitrary Tailwind values.** Add to the theme scale. Arbitrary values break density modes and audits.
- **Dark theme is primary, light is secondary** — don't test only in light and assume dark "just works." Test every screen in dark first.
- **Tabular numerics are critical** for financial and task-ID displays. Enable `font-variant-numeric: tabular-nums` on the relevant class — `.numeric { font-variant-numeric: tabular-nums; }`.
- **The command palette should never contain destructive-by-default actions** (delete project, revoke all tokens). Destructive actions require an explicit confirmation dialog.
- **Don't rely on hover-only affordances for mobile.** Every hover action must have an equivalent touch/tap or menu path.
- **Resizable panes save state per user per project, not globally.** Personal layout preferences should persist even across projects (different projects might want different layouts).
- **Keyboard shortcuts with `G` prefix** must not conflict with fast typing in text inputs. Use a global shortcut manager that excludes inputs from firing shortcuts unless a modifier is held.
- **`Enter` in inline editors** submits; `Esc` cancels. `⌘Enter` submits multi-line. Be consistent.
- **Animation on every state change is annoying.** Animate context changes (opening a modal, navigating) but not data changes (new row appears). Rule of thumb: animate the shell, not the content.
- **Loading spinners for operations < 300ms are worse than nothing.** Use optimistic UI for fast operations; reserve spinners for operations ≥ 500ms. For operations whose duration you can't predict, show a spinner after a 300ms delay (not immediately).
- **Empty states are prime places for over-design.** Rokki empty states are a single line and a button. Reject anything with illustrations beyond a tiny icon.
- **When you change typography or spacing tokens,** audit every view. A 1px shift can break alignment in dense tables.
