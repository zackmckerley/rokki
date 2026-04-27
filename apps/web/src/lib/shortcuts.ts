/**
 * Canonical keyboard-shortcut reference. One place, one shape — consumed by
 * the `/help` page, the `?` overlay, and the onboarding cheatsheet so they
 * never drift apart.
 *
 * Mirrors `docs/08_UI_DESIGN.md §8.6`. When we bind a new shortcut in a
 * component, add it here too so it shows up in the reference.
 *
 * **Audit rule (2026-04-26):** every entry below is wired to a real
 * handler. The previous list contained aspirational shortcuts (`A`, `D`,
 * `Space` quick-look, `S then T`, `P then 1`, etc.) that had no keydown
 * binding anywhere — those have been removed. If you add an entry here,
 * add the handler in the same PR, or it doesn't ship.
 */

export interface Shortcut {
  /** Human-readable keys. Use "⌘K", "⌘⇧P", "G then D", "?" style. */
  keys: string;
  description: string;
  /** Optional note — e.g. "platform admin only", "requires pane focus". */
  note?: string;
}

export interface ShortcutSection {
  /** Short section id used for anchors on the help page. */
  id: string;
  title: string;
  /** One-line subtitle shown under the section heading. */
  subtitle?: string;
  shortcuts: Shortcut[];
}

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    id: "global",
    title: "Global",
    subtitle: "Available from anywhere in the app.",
    shortcuts: [
      { keys: "⌘K / Ctrl K", description: "Open the command palette" },
      { keys: "⌘⇧P", description: "Quick-switch — open the palette to a terminal" },
      { keys: "?", description: "Show this cheatsheet" },
      { keys: "Esc", description: "Close modal, dismiss, back out" },
      { keys: "⌘,", description: "Open settings" },
      { keys: "G then D", description: "Go to Dashboard" },
      { keys: "G then T", description: "Go to Tools" },
      { keys: "G then S", description: "Go to Settings" },
      { keys: "G then H", description: "Go to Help" },
      { keys: "⌘⇧L", description: "Toggle dark / light theme" },
      { keys: "⌘⇧D", description: "Toggle cozy / compact density" },
    ],
  },
  {
    id: "terminal",
    title: "Terminal navigation",
    subtitle: "Inside a terminal (project, matter, client, goal).",
    shortcuts: [
      { keys: "F2 – F12", description: "Switch between function-key panes" },
      { keys: "⌘\\", description: "Toggle right pane" },
      { keys: "⌘⇧\\", description: "Toggle left pane" },
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    subtitle: "With the Tasks pane focused, outside any input.",
    shortcuts: [
      { keys: "J", description: "Next task" },
      { keys: "K", description: "Previous task" },
      { keys: "Enter", description: "Toggle complete on the selected task" },
      { keys: "C", description: "Create a new task inline" },
      { keys: "⌘Enter", description: "Mark complete (works while typing)" },
      { keys: ";", description: "Open the comment thread" },
    ],
  },
  {
    id: "team",
    title: "Team",
    subtitle: "On the Team pane, with permission to invite.",
    shortcuts: [
      { keys: "I", description: "Open the invite dialog" },
    ],
  },
  {
    id: "drawings",
    title: "Drawings",
    subtitle: "While editing an annotation draft on a drawing.",
    shortcuts: [
      { keys: "Click drawing", description: "Drop a pin / annotation anchor" },
      { keys: "⌘Enter", description: "Save the annotation draft" },
      { keys: "Esc", description: "Cancel the draft" },
    ],
  },
  {
    id: "messages",
    title: "Messages & comments",
    subtitle: "In a comment thread.",
    shortcuts: [
      { keys: "⌘Enter", description: "Send the message" },
      { keys: "⇧Enter", description: "New line inside the message" },
      { keys: "@", description: "Mention a terminal member" },
    ],
  },
  {
    id: "palette",
    title: "Command palette (⌘K)",
    subtitle: "Inside the palette.",
    shortcuts: [
      { keys: "↑ / ↓", description: "Move selection" },
      { keys: "Enter", description: "Run command" },
      { keys: "Esc", description: "Close palette" },
    ],
  },
];

/**
 * True if the given key event originated inside an editable element and
 * should therefore NOT fire global single-key shortcuts like `?` or `G`.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
