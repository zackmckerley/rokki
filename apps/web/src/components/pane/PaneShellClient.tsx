"use client";

import { useRouter } from "next/navigation";
import { PaneArea } from "./PaneArea";
import { PaneShell } from "./PaneShell";
import { usePinnedModules } from "./usePinnedModules";
import { listManifestsForScope } from "@rokki/sdk";
import type {
  InstalledModuleEntry,
  PaneScope,
} from "./types";

interface PaneShellClientProps {
  scope: PaneScope;
  activeSlug: string;
  modules: InstalledModuleEntry[];
  children: React.ReactNode;
}

/**
 * Client-side wrapper around the static `PaneShell` that wires tab
 * clicks to Next.js navigation. The server resolves modules + the
 * active slug via `ScopedModuleShell`; this component just glues
 * them onto the routing layer.
 *
 * Multi-pane support comes from `PaneArea` — Phase 1 uses
 * single-pane layout; Phase 4 unlocks split-2 / grid-4.
 */
export function PaneShellClient({
  scope,
  activeSlug,
  modules,
  children,
}: PaneShellClientProps) {
  const router = useRouter();
  const split = usePinnedModules({ installed: modules, scope });

  function navigateToModule(slug: string) {
    const href = hrefForModule(scope, slug);
    if (href) router.push(href);
  }

  function navigateToMarketplace() {
    if (scope.kind === "space") {
      router.push(`/s/${scope.slug}/settings/modules`);
    } else if (scope.kind === "terminal") {
      router.push(`/p/${scope.ticker}/settings/modules`);
    } else {
      // No marketplace at user scope — modules are installed per
      // space/terminal, not globally. Send the user to their first
      // space's marketplace if we knew one, else no-op.
      // Phase 3 may surface a discovery view here.
    }
  }

  return (
    <PaneArea initialLayout="single">
      <PaneShell
        scope={scope}
        activeSlug={activeSlug}
        modules={split}
        focused
        onSelectTab={navigateToModule}
        onAddModule={navigateToMarketplace}
      >
        {children}
      </PaneShell>
    </PaneArea>
  );
}

/**
 * Build the route for a module slug at the current scope. Uses the
 * manifest's `routes` declaration so adding a new module is just a
 * manifest entry; no routing logic needs to change.
 */
function hrefForModule(scope: PaneScope, slug: string): string | null {
  const m = listManifestsForScope(scope.kind).find((m) => m.slug === slug);
  if (!m) return null;
  const pattern = m.routes[scope.kind];
  if (!pattern) return null;
  if (scope.kind === "user") return pattern;
  if (scope.kind === "space") {
    return pattern.replace("[slug]", scope.slug);
  }
  return pattern.replace("[ticker]", scope.ticker);
}
