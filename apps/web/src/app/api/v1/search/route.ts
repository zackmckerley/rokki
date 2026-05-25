import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

/**
 * GET /api/v1/search
 *
 *   Without `q`        — returns the user's accessible terminals (legacy
 *                        shape used by the command palette as a quick-switch
 *                        list). Kept for backwards compatibility.
 *
 *   With `q=<query>`   — full-text search across tasks, files, comments,
 *                        terminals, and spaces. RLS scopes results to rows
 *                        the user can SELECT.
 *
 *     ?q=<text>        required for search mode
 *     ?types=task,file,comment,terminal,space
 *                      optional comma list; defaults to all five
 *     ?limit=<n>       1..50, default 50
 *
 *   Response:
 *     {
 *       "data": {
 *         "projects": [...],          // legacy, only present without q
 *         "results":  [...],          // present when q is set
 *         "query":    "..."
 *       }
 *     }
 *
 * Snippets are HTML — `ts_headline` HTML-escapes its input, then wraps
 * matches in `<mark class="rk-hit">…</mark>`. Renderers must respect that
 * single class but should NOT pass the snippet through any other HTML sink.
 */

const ALLOWED_KINDS = new Set([
  "task",
  "file",
  "comment",
  "terminal",
  "space",
]);

interface ProjectHit {
  id: string;
  slug: string;
  ticker: string;
  name: string;
}

interface SearchHit {
  kind: "task" | "file" | "comment" | "terminal" | "space";
  id: string;
  title: string;
  snippet: string;
  terminalTicker: string | null;
  terminalId: string | null;
  score: number;
}

interface RpcRow {
  kind: string;
  id: string;
  title: string;
  snippet: string;
  terminal_id: string | null;
  terminal_ticker: string | null;
  score: number;
}

async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: { projects: [] as ProjectHit[] } });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const typesRaw = url.searchParams.get("types");
  const limitRaw = url.searchParams.get("limit");

  // Legacy mode — no query, just return the project quick-switch list.
  if (!q) {
    const { data: projects } = await supabase
      .from("terminals")
      .select("id, slug, ticker, name")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    return NextResponse.json({
      data: { projects: (projects ?? []) as ProjectHit[] },
    });
  }

  // Search mode.
  const limit = clamp(limitRaw ? Number.parseInt(limitRaw, 10) : 50, 1, 50);

  let kinds: string[] | null = null;
  if (typesRaw) {
    const requested = typesRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => ALLOWED_KINDS.has(s));
    if (requested.length === 0) {
      return NextResponse.json({
        data: { results: [] as SearchHit[], query: q },
      });
    }
    kinds = requested;
  }

  // search_global is defined in 20260428010000_full_text_search.sql.
  // The generated Database types are regenerated out of band by
  //   `supabase gen types typescript --local > packages/db/src/generated.ts`,
  // so until someone runs that we cast the rpc name to bypass the missing
  // function entry. The runtime call works the moment the migration is applied.
  const result = await (
    supabase.rpc as unknown as (
      name: string,
      args: { _query: string; _kinds: string[] | null; _limit: number },
    ) => Promise<{ data: RpcRow[] | null; error: { message: string } | null }>
  )("search_global", { _query: q, _kinds: kinds, _limit: limit });

  if (result.error) {
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: result.error.message }] },
      { status: 500 },
    );
  }

  const rows = result.data ?? [];
  const results: SearchHit[] = rows.map((r) => ({
    kind: r.kind as SearchHit["kind"],
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    terminalTicker: r.terminal_ticker,
    terminalId: r.terminal_id,
    score: r.score,
  }));

  return NextResponse.json({
    data: { results, query: q },
  });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return hi;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export const GET = withObservability(handleGet, "GET /api/v1/search");
