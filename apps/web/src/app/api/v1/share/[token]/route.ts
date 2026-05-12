import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getSignedDownloadUrl } from "@/lib/storage";
import type { Database } from "@rokki/db";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Public token-exchange endpoint. Unauthenticated by design — the token
 * itself is the capability. We:
 *   1. Look up the link by token via service role (bypassing RLS)
 *   2. Check it isn't revoked or expired and (optionally) isn't past max_views
 *   3. Log the access with viewer metadata
 *   4. Return a short-lived signed storage URL
 *
 * ?download=1 marks the access as a download instead of a view.
 */
async function handleGet(request: NextRequest, { params }: Props) {
  const { token } = await params;
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: link } = await admin
    .from("share_links")
    .select(
      "id, file_id, expires_at, max_views, revoked_at, require_email",
    )
    .eq("token", token)
    .maybeSingle();
  type Link = {
    id: string;
    file_id: string;
    expires_at: string;
    max_views: number | null;
    revoked_at: string | null;
    require_email: boolean;
  };
  const l = link as Link | null;
  if (!l) return denied("not_found");
  if (l.revoked_at) return denied("revoked");
  if (new Date(l.expires_at).getTime() < Date.now()) return denied("expired");

  if (l.max_views != null) {
    const { count } = await admin
      .from("share_link_accesses")
      .select("id", { count: "exact", head: true })
      .eq("share_link_id", l.id)
      .eq("kind", "view");
    if ((count ?? 0) >= l.max_views) return denied("max_views_reached");
  }

  const { data: fileRow } = await admin
    .from("files")
    .select("id, filename, mime_type, size_bytes, blob_key")
    .eq("id", l.file_id)
    .maybeSingle();
  const file = fileRow as
    | {
        id: string;
        filename: string;
        mime_type: string;
        size_bytes: number;
        blob_key: string;
      }
    | null;
  if (!file) return denied("file_gone");

  const url = new URL(request.url);
  const kind = url.searchParams.get("download") === "1" ? "download" : "view";
  const viewerEmail = url.searchParams.get("email");
  if (l.require_email && !viewerEmail) return denied("email_required");

  // Record the access.
  const viewerIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const viewerUa = request.headers.get("user-agent")?.slice(0, 500) ?? null;
  await admin.from("share_link_accesses").insert({
    share_link_id: l.id,
    kind,
    viewer_email: viewerEmail,
    viewer_ip: viewerIp,
    viewer_ua: viewerUa,
  });

  const signed = await getSignedDownloadUrl(file.blob_key, 300);
  return NextResponse.json({
    data: {
      filename: file.filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      url: signed,
    },
  });
}

function denied(reason: string) {
  return NextResponse.json(
    { errors: [{ code: reason, message: friendly(reason) }] },
    { status: reason === "not_found" ? 404 : 403 },
  );
}

function friendly(reason: string): string {
  switch (reason) {
    case "not_found":
      return "This link doesn't exist.";
    case "revoked":
      return "This link has been revoked.";
    case "expired":
      return "This link has expired.";
    case "max_views_reached":
      return "This link has reached its view limit.";
    case "email_required":
      return "Please enter your email to access this file.";
    case "file_gone":
      return "The file is no longer available.";
    default:
      return "Access denied.";
  }
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/share/:token",
);
