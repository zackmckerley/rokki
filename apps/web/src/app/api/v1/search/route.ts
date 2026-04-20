import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/search — lightweight cross-project search used by the command palette.
 * Phase 1: returns accessible projects; Phase 2 adds tasks, files, tools.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: { projects: [] } });

  const { data: projects } = await supabase
    .from("terminals")
    .select("id, ticker, name")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ data: { projects: projects ?? [] } });
}
