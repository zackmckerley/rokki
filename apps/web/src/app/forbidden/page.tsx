import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, ShieldAlert, Mail } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Forbidden — Rokki" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ from?: string; reason?: string }>;
}

/**
 * /forbidden — destination for any "you cannot see this" redirect. Replaces
 * the previous `/?error=admin_only` query-param trick: a query param on the
 * dashboard had no real UI surface and was easy to miss. A standalone page
 * lets us tell the user *why* and offer a one-click "Request access"
 * mailto pre-filled with their account and the path they were aiming at.
 *
 * The `from` query param is the path the user was attempting (set by the
 * admin layout when redirecting). `reason` is a short machine code we map
 * to human copy below.
 */
export default async function ForbiddenPage({ searchParams }: Props) {
  const params = await searchParams;
  const from = params.from ?? "";
  const reason = params.reason ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const accountEmail = user?.email ?? "";

  // Header path the user was trying to reach, for "Request access" context.
  const h = await headers();
  const refererPath = from || h.get("referer") || "";

  const subject = encodeURIComponent("Rokki — request access");
  const body = encodeURIComponent(
    [
      `I'd like access to a Rokki area I can't currently reach.`,
      ``,
      `Account: ${accountEmail || "(not signed in)"}`,
      `Path: ${refererPath || "(unknown)"}`,
      reason ? `Reason returned: ${reason}` : "",
      `When: ${new Date().toISOString()}`,
      ``,
      `Why I need it:`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const headline = headlineFor(reason);
  const detail = detailFor(reason);

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <header className="flex h-11 flex-shrink-0 items-center border-b border-border bg-bg-1 px-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label="Rokki home"
        >
          <Wordmark size="md" />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <section
          className="w-full max-w-lg rounded border border-border bg-bg-1"
          aria-labelledby="forbidden-title"
        >
          <header className="flex items-center gap-2 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-warning">
            <ShieldAlert className="h-3 w-3" />
            HTTP 403 · forbidden
          </header>
          <div className="flex flex-col gap-5 p-6">
            <p
              className="font-mono text-5xl font-semibold text-accent"
              aria-hidden="true"
            >
              403
            </p>
            <div>
              <h1
                id="forbidden-title"
                className="text-xl font-semibold text-text-0"
              >
                {headline}
              </h1>
              <p className="mt-1 text-sm text-text-2">{detail}</p>
              {refererPath ? (
                <p className="mt-3 break-all rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-[11px] text-text-3">
                  <span className="text-text-2">target</span>{" "}
                  <span className="text-accent">{refererPath}</span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent hover:bg-accent/20"
              >
                <ArrowLeft className="h-3 w-3" /> Back to dashboard
              </Link>
              <a
                href={`mailto:support@rokki.ai?subject=${subject}&body=${body}`}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-1 hover:bg-bg-3"
              >
                <Mail className="h-3 w-3" /> Request access
              </a>
            </div>
          </div>
          {accountEmail ? (
            <footer className="border-t border-border px-4 py-2 text-[11px] text-text-3">
              Signed in as{" "}
              <span className="font-mono text-text-2">{accountEmail}</span>
            </footer>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function headlineFor(reason: string): string {
  switch (reason) {
    case "admin_only":
      return "Platform admins only.";
    case "space_admin_only":
      return "Space owners and admins only.";
    case "terminal_member_only":
      return "Members of this terminal only.";
    default:
      return "You don't have permission to view this.";
  }
}

function detailFor(reason: string): string {
  switch (reason) {
    case "admin_only":
      return "This area is reserved for the operator console. If you need access, ask a platform admin to flip the bit on your profile.";
    case "space_admin_only":
      return "Only the space owner or its admins can manage this. A space admin can grant you the role.";
    case "terminal_member_only":
      return "You're not on the member list for this terminal. Ask the terminal owner or a manager to add you.";
    default:
      return "Your account is signed in, but isn't authorised for this resource. Use the button below to ask for access.";
  }
}
