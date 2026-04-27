import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/openapi";

/**
 * GET /api/openapi.json
 *
 * Serves the auto-generated OpenAPI 3.1 document. Cached for an hour at the
 * edge — the doc is built at module-evaluation time, so it never changes
 * within a deployment.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  return NextResponse.json(openApiDocument, {
    headers: {
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
