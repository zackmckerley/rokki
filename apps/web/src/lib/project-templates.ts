/**
 * Universal space model.
 *
 * Every space in Rokki has the same core: Tasks, Team, and (soon) Files. Users
 * differentiate their spaces by attaching **modules** and **tools** — not by
 * picking a vertical-specific "template" up front. That keeps the UI learnable
 * (one interface for everything) and still lets a construction project look
 * very different from a legal matter in practice, once modules are attached.
 *
 * The default F-key set below is the universal core. Phase 2 will let users
 * enable optional modules per-space (Budget, Calendar, Documents, Dataroom,
 * etc.), and those modules will slot into F5+.
 */

import type { FunctionKey } from "@/components/FunctionKeys";

export const CORE_FUNCTION_KEYS: FunctionKey[] = [
  { key: "F2", label: "Files" },
  { key: "F3", label: "Tasks" },
  { key: "F4", label: "Team" },
];

export interface ModuleCard {
  name: string;
  icon: string;
}

export const CORE_MODULE_CARDS: ModuleCard[] = [
  { name: "Files", icon: "FileText" },
  { name: "Tasks", icon: "CheckSquare" },
  { name: "Team", icon: "Users" },
];

/**
 * A space's tagline shown on its overview page until the user writes a description.
 */
export const SPACE_TAGLINE =
  "A space for your team, your files, and your tasks. Add modules and tools as you grow.";
