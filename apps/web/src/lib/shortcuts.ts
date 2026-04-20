/**
 * Canonical keyboard-shortcut reference. One place, one shape — consumed by
 * the `/help` page, the `?` overlay, and the onboarding cheatsheet so they
 * never drift apart.
 *
 * Mirrors `docs/08_UI_DESIGN.md §8.6`. When we bind a new shortcut in a
 * component, add it here too so it shows up in the reference.
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
      { keys: "?", description: "Show this cheatsheet" },
      { keys: "Esc", description: "Close modal, dismiss, back out" },
      { keys: "⌘,", description: "Open settings" },
      { keys: "G then D", description: "Go to Dashboard" },
      { keys: "G then T", description: "Go to Tools" },
      { keys: "G then S", description: "Go to Settings" },
      { keys: "G then H", description: "Go to Help" },
      { keys: "⌘⇧P", description: "Quick-switch terminal (fuzzy)" },
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
      { keys: "⌘⇧F", description: "Full-screen current pane" },
      { keys: "⌘1 – ⌘9", description: "Switch to last N terminals (MRU)" },
      { keys: "[", description: "Previous tab / pane" },
      { keys: "]", description: "Next tab / pane" },
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    subtitle: "With the Tasks pane focused.",
    shortcuts: [
      { keys: "J", description: "Next task" },
      { keys: "K", description: "Previous task" },
      { keys: "Enter", description: "Open the selected task" },
      { keys: "Space", description: "Quick-look preview" },
      { keys: "C", description: "Create a new task inline" },
      { keys: "A", description: "Assign (opens member picker)" },
      { keys: "D", description: "Set due date" },
      {
        keys: "S then T / I / B / R / D",
        description: "Status — todo, in-progress, blocked, review, done",
      },
      { keys: "P then 1 – 4", description: "Priority — P1 (urgent) to P4 (low)" },
      { keys: "L", description: "Add label" },
      { keys: "⌘Enter", description: "Toggle complete" },
      { keys: ";", description: "Open comment thread" },
      { keys: "⌘Backspace", description: "Delete (soft)" },
      { keys: "/", description: "Search within the list" },
    ],
  },
  {
    id: "files",
    title: "Files",
    subtitle: "With the Files pane focused.",
    shortcuts: [
      { keys: "U", description: "Upload file" },
      { keys: "Space", description: "Quick-look preview" },
      { keys: "Enter", description: "Open file" },
      { keys: "P", description: "Permissions dialog" },
      { keys: "R", description: "Rename" },
      { keys: "D / ⌘D", description: "Download" },
      { keys: "⌫", description: "Soft-delete" },
      { keys: "V", description: "Toggle list / grid view" },
    ],
  },
  {
    id: "drawings",
    title: "Drawings",
    subtitle: "With the Drawings viewer open.",
    shortcuts: [
      { keys: "Click drawing", description: "Drop a pin / annotation anchor" },
      { keys: "⌘Enter", description: "Save the annotation draft" },
      { keys: "Esc", description: "Cancel the draft" },
      { keys: "← / →", description: "Previous / next page" },
      { keys: "+ / −", description: "Zoom in / out" },
    ],
  },
  {
    id: "messages",
    title: "Messages",
    subtitle: "In a channel, DM, or comment thread.",
    shortcuts: [
      { keys: "⌘Enter", description: "Send message" },
      { keys: "⇧Enter", description: "New line inside a message" },
      { keys: "↑", description: "Edit your last message" },
      { keys: "Esc", description: "Cancel editing" },
      { keys: "@", description: "Mention a terminal member" },
    ],
  },
  {
    id: "ai",
    title: "AI chat",
    shortcuts: [
      { keys: "⌘J", description: "Toggle the AI chat panel" },
      { keys: "⌘Enter", description: "Send message" },
      { keys: "⇧Enter", description: "New line" },
      { keys: "⌘L", description: "Clear chat" },
      { keys: "⌘↑", description: "Edit previous message" },
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
