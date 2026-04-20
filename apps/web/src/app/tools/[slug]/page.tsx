import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ToolEditor } from "@/components/ToolEditor";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ToolDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: toolData } = await supabase
    .from("tools")
    .select(
      "id, slug, name, description, visibility, input_schema, output_schema, current_version, tags, timeout_seconds, owner_user_id",
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!toolData) notFound();
  const tool = toolData as {
    id: string;
    slug: string;
    name: string;
    description: string;
    visibility: "private" | "org" | "project" | "public";
    input_schema: Record<string, unknown>;
    output_schema: Record<string, unknown> | null;
    current_version: string;
    tags: string[] | null;
    timeout_seconds: number;
    owner_user_id: string;
  };

  const { data: versionData } = await supabase
    .from("tool_versions")
    .select("scripts, entrypoint")
    .eq("tool_id", tool.id)
    .eq("version", tool.current_version)
    .maybeSingle();
  const version = versionData as {
    scripts: Record<string, string>;
    entrypoint: string;
  } | null;

  // Invocation history for this tool.
  const { data: invData } = await supabase
    .from("tool_invocations")
    .select("id, status, duration_ms, started_at, error_message")
    .eq("tool_id", tool.id)
    .order("started_at", { ascending: false })
    .limit(10);
  type Inv = {
    id: string;
    status: string;
    duration_ms: number | null;
    started_at: string;
    error_message: string | null;
  };
  const invocations = (invData ?? []) as Inv[];

  const isOwner = tool.owner_user_id === user.id;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar>
        <Link href="/tools" className="text-text-3 hover:text-text-1">
          ← Tools
        </Link>
        <span className="text-text-3">·</span>
        <span className="font-mono text-text-0">{tool.slug}</span>
        <span className="font-mono text-[10px] text-text-3">
          v{tool.current_version}
        </span>
      </TopBar>
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-0">{tool.name}</h1>
            <p className="mt-0.5 text-sm text-text-2">{tool.description}</p>
          </div>
          {!isOwner ? (
            <span className="rounded-sm bg-bg-2 px-2 py-1 text-[10px] text-text-3">
              Read-only (not the owner)
            </span>
          ) : null}
        </div>

        {isOwner ? (
          <ToolEditor
            initialSlug={tool.slug}
            currentVersion={tool.current_version}
            initial={{
              slug: tool.slug,
              name: tool.name,
              description: tool.description,
              input_schema: JSON.stringify(tool.input_schema, null, 2),
              output_schema: tool.output_schema
                ? JSON.stringify(tool.output_schema, null, 2)
                : "",
              code: version?.scripts?.[version.entrypoint] ?? "",
              timeout_seconds: tool.timeout_seconds,
              tags: tool.tags ?? [],
              visibility: tool.visibility,
            }}
          />
        ) : (
          <div className="rounded border border-border bg-bg-1 p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs text-text-1">
              {version?.scripts?.[version.entrypoint] ?? ""}
            </pre>
          </div>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">
            Recent invocations
          </h2>
          {invocations.length === 0 ? (
            <p className="rounded border border-dashed border-border p-4 text-center text-xs text-text-3">
              No invocations yet. Try calling this tool from MCP or the test
              runner above.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded border border-border bg-bg-1 text-xs">
              {invocations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <StatusDot status={inv.status} />
                  <span className="font-mono text-text-2">
                    {new Date(inv.started_at).toLocaleString()}
                  </span>
                  <span className="flex-1 truncate text-text-1">
                    {inv.error_message ?? (inv.status === "success" ? "ok" : inv.status)}
                  </span>
                  {inv.duration_ms != null ? (
                    <span className="font-mono text-text-3">
                      {inv.duration_ms}ms
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "success"
      ? "bg-success"
      : status === "running"
        ? "bg-info"
        : status === "timeout"
          ? "bg-warning"
          : "bg-danger";
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} />;
}
