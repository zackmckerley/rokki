import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

export const maxDuration = 15;

/**
 * GET /api/v1/gif/search?q=…  — proxy Tenor GIF search behind our key.
 *
 * Requires auth (so the key + quota aren't exposed to the open internet).
 * Returns a slim shape: { id, description, preview, url }. Empty query returns
 * Tenor's featured GIFs. Set TENOR_API_KEY in the environment to enable.
 */
async function handleGet(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );
  }

  const key = process.env.TENOR_API_KEY;
  if (!key) {
    return NextResponse.json(
      { errors: [{ message: "GIF search isn't configured (set TENOR_API_KEY)" }] },
      { status: 503 },
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const base = q
    ? "https://tenor.googleapis.com/v2/search"
    : "https://tenor.googleapis.com/v2/featured";
  const params = new URLSearchParams({
    key,
    client_key: "rokki",
    limit: "24",
    media_filter: "gif,tinygif",
    contentfilter: "medium",
  });
  if (q) params.set("q", q);

  const r = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json(
      { errors: [{ message: "GIF search failed" }] },
      { status: 502 },
    );
  }
  const body = (await r.json()) as {
    results?: {
      id: string;
      content_description?: string;
      media_formats?: {
        gif?: { url: string };
        tinygif?: { url: string };
      };
    }[];
  };
  const data = (body.results ?? [])
    .map((g) => ({
      id: g.id,
      description: g.content_description ?? "GIF",
      preview: g.media_formats?.tinygif?.url ?? g.media_formats?.gif?.url ?? "",
      url: g.media_formats?.gif?.url ?? "",
    }))
    .filter((g) => g.url && g.preview);

  return NextResponse.json({ data });
}

export const GET = withObservability(handleGet, "GET /api/v1/gif/search");
