import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ModulesMarketplace } from "@/components/modules/ModulesMarketplace";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * `/s/[slug]/settings/modules` — module marketplace at space scope.
 *
 * Lists every `modules_catalog` row that supports `space` scope, with
 * an Install/Archive button per row. The install/archive endpoints
 * mirror the MCP tools so API+MCP parity holds (ADR 0003).
 */
export default async function SpaceModulesPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: spaceRow } = await supabase
    .from("spaces")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  const space = spaceRow as { id: string; name: string; slug: string } | null;
  if (!space) redirect("/");

  // Modules whose scopes array contains 'space'.
  const { data: catRows } = await supabase
    .from("modules_catalog")
    .select("slug, name, description, icon, scopes")
    .contains("scopes", ["space"])
    .order("name", { ascending: true });
  type Cat = {
    slug: string;
    name: string;
    description: string;
    icon: string | null;
    scopes: string[];
  };
  const catalog = (catRows ?? []) as Cat[];

  const { data: installedRows } = await supabase
    .from("space_modules")
    .select("slug, installed_at, installed_by")
    .eq("space_id", space.id)
    .is("archived_at", null);
  type Inst = { slug: string; installed_at: string; installed_by: string };
  const installed = (installedRows ?? []) as Inst[];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link
          href={`/s/${space.slug}/settings`}
          className="text-text-3 hover:text-text-1"
        >
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-text-2">
          {space.name}
        </span>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Modules</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4">
        <ModulesMarketplace
          scopeKind="space"
          scopeKey={space.id}
          scopeLabel={space.name}
          catalog={catalog}
          installed={installed}
        />
      </main>
    </div>
  );
}
