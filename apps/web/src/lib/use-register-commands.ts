"use client";

import { useEffect } from "react";
import { useCommands, type Command } from "./commands";

/**
 * Register commands that exist while a component is mounted. Pass a stable
 * `scopeId` (usually something like `tasks:<projectId>`) so the palette can
 * replace the same scope's commands on re-render.
 *
 * The `commands` array identity matters. If you construct new handlers on
 * every render, wrap the call site in a useMemo — otherwise every render
 * will re-register (correct, but wasteful).
 */
export function useRegisterCommands(scopeId: string, commands: Command[]) {
  const api = useCommands();
  useEffect(() => {
    return api.register(commands, scopeId);
  }, [api, scopeId, commands]);
}
