import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DensityProvider, type Density } from "@/lib/density";
import { ExplorerRail } from "@/components/dashboard/ExplorerRail";
import {
  loadDashSpaces,
  loadDashTerminals,
} from "@/lib/dashboard-queries";

/**
 * Layout for /p/[ticker]/* — terminal pages.
 *
 * Mounts the same left-rail Explorer that the dashboard uses, so the user
 * can jump between spaces/terminals or back to the dashboard without
 * having to click the wordmark. Spaces + terminals are fetched here (not
 * inside ExplorerRail) so the rail can render server-side.
 *
 * The rail's bottom AccountBlock is the single home for account-level
 * actions (sign out, switch ring, settings, density, admin toggle).
 *
 * Each terminal page still renders its own TopBar and TerminalShell to the
 * right of the rail.
 */
export default async function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [spaces, terminals, toolsResult, profileResult] = await Promise.all([
    loadDashSpaces(supabase, user.id),
    loadDashTerminals(supabase),
    supabase
      .from("tools")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("profiles")
      .select("full_name, is_platform_admin, settings")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as
    | {
        full_name: string | null;
        is_platform_admin: boolean;
        settings: Record<string, unknown> | null;
      }
    | null;
  const userName =
    profile?.full_name ?? user.email?.split("@")[0] ?? "there";
  const initialDensity: Density =
    profile?.settings?.density === "compact" ? "compact" : "cozy";
  const isPlatformAdmin = Boolean(profile?.is_platform_admin);

  return (
    <DensityProvider initial={initialDensity}>
      <div className="flex h-[100dvh] overflow-hidden bg-bg-0">
        <aside
          aria-label="Explorer"
          data-print-hide="true"
          className="hidden h-full w-[260px] flex-shrink-0 border-r border-border lg:flex lg:flex-col print:hidden"
        >
          <ExplorerRail
            spaces={spaces}
            terminals={terminals}
            toolCount={toolsResult.count ?? 0}
            userName={userName}
            userEmail={user.email ?? ""}
            isPlatformAdmin={isPlatformAdmin}
            canCreateSpace={isPlatformAdmin}
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </DensityProvider>
  );
}
