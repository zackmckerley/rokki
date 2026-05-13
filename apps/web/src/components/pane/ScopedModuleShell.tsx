import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { paneShellEnabled } from "@/lib/featureFlags";
import {
  applyPins,
  loadInstalledModules,
  loadUserPins,
  resolveSpaceScope,
  resolveTerminalScope,
} from "@/lib/modules/scope";
import { listManifestsForScope } from "@rokki/sdk";
import { PaneShellClient } from "./PaneShellClient";
import type {
  InstalledModuleEntry,
  PaneScope,
} from "./types";

interface Props {
  /** Where the page is rooted. */
  scopeKind: "user" | "space" | "terminal";
  /** For space: the slug. For terminal: the ticker. For user: ignored. */
  scopeKey?: string;
  /** Active module slug — the tab to highlight. */
  activeSlug: string;
  /** Page content. Rendered inside the shell when the flag is on. */
  children: ReactNode;
  /**
   * When the flag is OFF, what to do? Default `"passthrough"` renders
   * `children` without any chrome (existing route layout takes over).
   * `"render"` always renders the shell regardless of flag — used by
   * routes that exist only in the new module-system world.
   */
  flagOffBehavior?: "passthrough" | "render";
}

/**
 * Server-side wrapper that renders `children` inside a `PaneShell`
 * when `pane_shell_enabled` is on for the viewer, and passes through
 * unchanged when it isn't.
 *
 * Most Phase 1 routes mount via this wrapper. The flag check happens
 * once per request; when off, the existing top-bar / single-card
 * layout takes over.
 *
 * Auth + scope resolution lives here so the route file stays tiny:
 *
 * ```tsx
 * export default async function Page() {
 *   return (
 *     <ScopedModuleShell scopeKind="user" activeSlug="tasks">
 *       <TasksUserView />
 *     </ScopedModuleShell>
 *   );
 * }
 * ```
 */
export async function ScopedModuleShell({
  scopeKind,
  scopeKey,
  activeSlug,
  children,
  flagOffBehavior = "passthrough",
}: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const flagOn = await paneShellEnabled(user.id);

  if (!flagOn && flagOffBehavior === "passthrough") {
    // Old world — let the route's existing layout handle chrome.
    return <>{children}</>;
  }

  // Resolve scope label + id. Failure here means the user typed a
  // slug/ticker they can't see, which RLS would already reject —
  // surface a clean 404 instead of an empty shell.
  let scope: PaneScope | null = null;
  let scopeIdForLookup: string | null = null;
  if (scopeKind === "space") {
    scope = scopeKey ? await resolveSpaceScope(supabase, scopeKey) : null;
    scopeIdForLookup = scope && scope.kind === "space" ? scope.id : null;
  } else if (scopeKind === "terminal") {
    scope = scopeKey ? await resolveTerminalScope(supabase, scopeKey) : null;
    scopeIdForLookup = scope && scope.kind === "terminal" ? scope.id : null;
  } else {
    scope = { kind: "user", label: "Home" };
  }
  if (!scope) {
    // Not found / no access.
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-bg-0 text-text-2">
        <p>Not found.</p>
      </div>
    );
  }

  // Load installed modules + user pins. For user scope, fall back to
  // the manifest list since there's no row in `space_modules` /
  // `terminal_modules` for user scope.
  let installed: InstalledModuleEntry[];
  if (scopeKind === "user") {
    installed = listManifestsForScope("user").map((m, i) => ({
      slug: m.slug,
      name: m.name,
      icon: m.icon,
      scope: "user" as const,
      displayOrder: i,
      pinned: true,
    }));
  } else {
    installed = await loadInstalledModules(
      supabase,
      scopeKind,
      scopeIdForLookup!,
    );
  }
  const pins = await loadUserPins(
    supabase,
    user.id,
    scopeKind,
    scopeIdForLookup,
  );
  const resolved = applyPins(installed, pins);

  return (
    <PaneShellClient
      scope={scope}
      activeSlug={activeSlug}
      modules={resolved}
    >
      {children}
    </PaneShellClient>
  );
}
