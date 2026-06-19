import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

export const maxDuration = 20;

// Only Tenor media hosts — prevents this from being an open SSRF proxy.
const TENOR_HOST = /^https:\/\/([a-z0-9-]+\.)?tenor\.com\//i;

/**
 * GET /api/v1/gif/proxy?url=…  — stream a Tenor GIF through our origin so the
 * client can turn it into a File for the attachment pipeline without CORS
 * trouble. The url MUST be a tenor.com media URL.
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

  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!TENOR_HOST.test(url)) {
    return NextResponse.json(
      { errors: [{ message: "only tenor.com media is allowed" }] },
      { status: 400 },
    );
  }

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json(
      { errors: [{ message: "couldn't fetch the GIF" }] },
      { status: 502 },
    );
  }
  const buf = await r.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "content-type": r.headers.get("content-type") ?? "image/gif",
      "cache-control": "private, max-age=3600",
    },
  });
}

export const GET = withObservability(handleGet, "GET /api/v1/gif/proxy");
