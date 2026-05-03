import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DensityProvider, type Density } from "@/lib/density";

/**
 * Layout for /p/[ticker]/* — terminal pages.
 *
 * Thin wrapper now: just auth gate + DensityProvider. The ExplorerRail
 * + topbar layout used to live here as a flex row (aside | children),
 * which made the topbar (rendered inside children) sit *next to* the
 * rail rather than spanning over it. Result: the rail visually started
 * at the very top of the page, ahead of the topbar — inconsistent
 * with the dashboard, where the topbar spans the full viewport width
 * and the rail begins below it.
 *
 * To match the dashboard's shape, ExplorerRail mounting moved into
 * TerminalShell (apps/web/src/components/TerminalShell.tsx) so the
 * shell renders: topbar (full width) → ticker (full width) → flex
 * row [ExplorerRail | center | right]. Same vertical alignment as
 * DashboardShell.
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  const initialDensity: Density =
    (profile as { settings?: { density?: string } } | null)?.settings
      ?.density === "compact"
      ? "compact"
      : "cozy";

  return (
    <DensityProvider initial={initialDensity}>
      {/* h-[100dvh] + overflow-hidden so TerminalShell's `h-full
          min-h-0` flex column has a fixed height to size against.
          Without this the shell collapses to content-height and the
          page leaves a white block of viewport empty below the
          command bar. */}
      <div className="h-[100dvh] overflow-hidden bg-bg-0">{children}</div>
    </DensityProvider>
  );
}
