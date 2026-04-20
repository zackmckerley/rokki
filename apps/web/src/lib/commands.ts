"use client";

import { createContext, useContext } from "react";

/**
 * Command palette primitives. A `Command` is anything that can be triggered
 * from ⌘K: navigate to a route, run an action, invoke a custom tool,
 * search, etc. Components that care about space-scoped or pane-scoped
 * commands register them via `useRegisterCommands`; the palette dedupes by
 * id and re-renders live.
 */

export type CommandCategory =
  | "navigation"
  | "action"
  | "search"
  | "tool"
  | "help";

export interface Command {
  /** Stable id — replacing a command reuses the same id. */
  id: string;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  /** Lowercase terms used in addition to the title for fuzzy matching. */
  keywords?: string[];
  /** Primary shortcut, rendered as a kbd hint. */
  shortcut?: string;
  /** Lucide icon name or any React node. */
  icon?: React.ReactNode;
  /** Fires when the command is chosen. The palette closes automatically. */
  onRun: () => void | Promise<void>;
}

export interface CommandAPI {
  register: (commands: Command[], scopeId: string) => () => void;
  all: () => Command[];
  subscribe: (cb: () => void) => () => void;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  subscribeOpen: (cb: (open: boolean) => void) => () => void;
}

export const CommandContext = createContext<CommandAPI | null>(null);

export function useCommands(): CommandAPI {
  const ctx = useContext(CommandContext);
  if (!ctx)
    throw new Error(
      "useCommands must be used inside <CommandPaletteProvider>",
    );
  return ctx;
}
