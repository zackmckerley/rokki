/**
 * Hand-curated, user-facing copy for the inline `<HelpTip>` component.
 *
 * Wire one of these into a UI label that historically confused users
 * (priority semantics, recurrence rule, role names, RLS-protected
 * actions). The tooltip body should be ONE short sentence — if it needs
 * more, link out to the help page instead.
 *
 * Adding a new tip:
 *   1. Drop a `kebab-case-key` here with a `body` string and an
 *      optional `more` URL.
 *   2. `<HelpTip term="kebab-case-key">Label</HelpTip>` next to the
 *      label or input.
 *
 * Anti-pattern: don't put tooltips on EVERYTHING. Friction that
 * teaches once is cheaper than friction that pesters forever.
 */

export interface HelpTip {
  /** One-line plain-English body. No markdown, no HTML. */
  body: string;
  /** Optional deep-link to the canonical help section. */
  more?: string;
}

export const HELP_TIPS: Record<string, HelpTip> = {
  "task-priority": {
    body:
      "Priority is 1 (urgent) → 4 (low). The task list sorts by status first, then priority, so urgent items rise to the top within each status group.",
    more: "/help#tasks",
  },
  "task-recurrence": {
    body:
      "When a recurring task is marked done, Rokki spawns the next occurrence automatically using the rule's pattern + interval. The series stops once the optional end date passes.",
  },
  "task-status": {
    body:
      "Statuses (todo → in_progress → review → blocked → done) are flat — there's no kanban swim-lane. Move freely with the keyboard or by clicking the pill.",
  },
  "terminal-role": {
    body:
      "Owner: full control, can delete the terminal. Manager: can change settings and members. Member: can edit tasks/files. Guest: scoped read access only.",
    more: "/help#concepts",
  },
  "space-role": {
    body:
      "Space-level roles (owner, admin, member) are independent of terminal roles. Only owners and admins can create new terminals inside the space.",
    more: "/help#concepts",
  },
  "file-visibility": {
    body:
      "Project: all terminal members. Owners: only owners + managers. Custom: pick exact people or roles. Visibility is enforced by Postgres RLS — you can't override it from the UI.",
  },
  "file-trash": {
    body:
      "Soft-deleted files stay recoverable for 30 days. Permanent delete removes the file from storage and audit trails — there is no undo.",
  },
  "task-attach-files": {
    body:
      "Drag a file row onto a task row to attach it. Same goes for assigning members — drag a person from the Team pane onto a task.",
    more: "/help#tasks",
  },
  "task-merge": {
    body:
      "Drag one task onto another to merge them. The source becomes a closed, tagged snapshot in history; comments and attachments move to the target.",
  },
  "rls-action": {
    body:
      "This action is enforced at the database level (Row-Level Security). If you don't see the button or get a permission error, your role on this terminal or space doesn't allow it.",
    more: "/help#concepts",
  },
  "ticker-symbol": {
    body:
      "The 4-letter code identifying this terminal across the app. Auto-derived from the name when the terminal is created; admins can rename it from Settings.",
  },
  "command-palette": {
    body:
      "⌘K opens the command palette — a single search box that finds every action, terminal, member, and setting in the app. Tab into a result, ↵ to run.",
    more: "/help#start-here",
  },
};

export function tipFor(key: string): HelpTip | null {
  return HELP_TIPS[key] ?? null;
}
