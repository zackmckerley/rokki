import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Sparkles, Lock, Globe, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { EmptyState } from "@/components/EmptyState";

/**
 * /tools — list of tools visible to the signed-in user.
 * Per-tool rows link to /tools/[slug] for edit + test.
 */
export default async function ToolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("tools")
    .select(
      "slug, name, description, visibility, current_version, tags, owner_user_id, updated_at",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  type Row = {
    slug: string;
    name: string;
    description: string;
    visibility: "private" | "org" | "project" | "public";
    current_version: string;
    tags: string[] | null;
    owner_user_id: string;
    updated_at: string;
  };
  const rows = (data ?? []) as Row[];

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Tools</span>
      </TopBar>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-text-0">
              <Sparkles className="h-5 w-5 text-accent" />
              Tools
            </h1>
            <p className="mt-1 text-sm text-text-2">
              Custom skills that Claude (or any MCP client) can invoke.
            </p>
          </div>
          <Link
            href="/tools/new"
            className="flex items-center gap-1.5 rounded border border-border bg-bg-1 px-3 py-1.5 text-sm text-text-0 hover:bg-bg-2"
          >
            <Plus className="h-3.5 w-3.5" /> New tool
          </Link>
        </div>

        {rows.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y divide-border rounded border border-border bg-bg-1">
            {rows.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/tools/${t.slug}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-bg-2"
                >
                  <VisibilityIcon v={t.visibility} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-0">
                        {t.name}
                      </span>
                      <span className="font-mono text-[11px] text-text-3">
                        {t.slug}
                      </span>
                      <span className="font-mono text-[10px] text-text-3">
                        v{t.current_version}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-2">
                      {t.description}
                    </p>
                    {t.tags && t.tags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-sm bg-bg-2 px-1.5 py-0.5 text-[10px] text-text-3"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-text-3">
                    {timeAgo(t.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function VisibilityIcon({
  v,
}: {
  v: "private" | "org" | "project" | "public";
}) {
  if (v === "public")
    return <Globe className="mt-0.5 h-3.5 w-3.5 text-accent" aria-label="Public" />;
  if (v === "org")
    return (
      <Building2
        className="mt-0.5 h-3.5 w-3.5 text-text-2"
        aria-label="Org-shared"
      />
    );
  return <Lock className="mt-0.5 h-3.5 w-3.5 text-text-3" aria-label="Private" />;
}

function Empty() {
  return (
    <div className="rounded border border-dashed border-border bg-bg-1">
      <EmptyState
        icon={Sparkles}
        title="No tools yet."
        body="Tools are JavaScript skills that Claude can call on your behalf."
        action={{
          label: "+ New tool",
          href: "/tools/new",
          variant: "accent",
        }}
        className="p-10"
      />
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
