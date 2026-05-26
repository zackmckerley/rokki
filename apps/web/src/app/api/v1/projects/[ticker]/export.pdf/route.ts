import { NextResponse, type NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET /api/v1/projects/:ticker/export.pdf
 *
 * Renders the dedicated print page (/p/:ticker/print) to a PDF using
 * Playwright (devDep already pinned in apps/web/package.json) and
 * returns it as an attachment.
 *
 * IMPORTANT — this only works in environments where Playwright AND a
 * compatible Chromium can run:
 *   - local dev: works after `pnpm exec playwright install chromium`
 *   - CI / staging: works if the runner has the chromium binary
 *   - Vercel serverless: does NOT work (chromium binary too large for
 *     the lambda budget). The browser-print path in PrintActions is the
 *     primary export path; this endpoint is opportunistic.
 *
 * On any failure to import / launch we return 503 with a structured
 * error so the client surfaces a friendly fallback message.
 *
 * Auth: forwards the caller's session cookie into the puppeteer context
 * so the rendered page sees the same RLS-scoped data the user would
 * see in the browser. We never hand the browser a service-role token.
 */
async function handle(request: NextRequest, { params }: Props) {
  const { ticker } = await params;

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

  // Verify the caller has access to this terminal before paying the
  // (expensive) cost of launching a browser.
  const terminalRow = await resolveTerminalBySegment(supabase, ticker);
  if (!terminalRow) {
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Terminal not found" }] },
      { status: 404 },
    );
  }

  // Dynamic import — never bundled into the serverless function. If
  // playwright isn't installed (common on Vercel), this throws and we
  // fall through to the 503 below. We import via a non-literal specifier
  // so the TS resolver doesn't try to resolve it at compile time
  // (playwright is a devDep — not present in the runtime types).
  type ChromiumLike = { launch: (opts?: unknown) => Promise<unknown> };
  type PlaywrightModule = { chromium: ChromiumLike };
  const playwrightSpecifier = "playwright";
  let chromium: ChromiumLike;
  try {
    const mod = (await import(/* webpackIgnore: true */ playwrightSpecifier).catch(
      () => null,
    )) as PlaywrightModule | null;
    if (!mod) throw new Error("playwright not installed");
    chromium = mod.chromium;
  } catch {
    return NextResponse.json(
      {
        errors: [
          {
            code: "pdf_unavailable",
            message:
              "Server-side PDF export is unavailable in this environment. Use the browser's Print → Save as PDF instead.",
          },
        ],
      },
      { status: 503 },
    );
  }

  // Build the print URL we want puppeteer to load. Use the same host
  // the request came in on so we don't have to plumb a NEXT_PUBLIC_SITE
  // env var.
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("host") ?? "localhost:3000";
  const printUrl = `${proto}://${host}/p/${terminalRow.slug}/print`;

  // Forward the caller's auth cookies into the puppeteer browser
  // context so the page renders as the user, not anonymous.
  const cookieStore = await cookies();
  const cookieList = cookieStore.getAll().map((c) => ({
    name: c.name,
    value: c.value,
    domain: hdrs.get("host")?.split(":")[0] ?? "localhost",
    path: "/",
  }));

  type Browser = {
    newContext: (opts?: unknown) => Promise<{
      addCookies: (cookies: unknown[]) => Promise<void>;
      newPage: () => Promise<{
        goto: (url: string, opts?: unknown) => Promise<unknown>;
        emulateMedia: (opts: { media: "print" | "screen" }) => Promise<void>;
        pdf: (opts?: unknown) => Promise<Uint8Array>;
      }>;
      close: () => Promise<void>;
    }>;
    close: () => Promise<void>;
  };

  let browser: Browser;
  try {
    browser = (await chromium.launch({ headless: true })) as Browser;
  } catch (e) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "pdf_browser_launch_failed",
            message: `Could not launch headless browser: ${
              e instanceof Error ? e.message : "unknown error"
            }`,
          },
        ],
      },
      { status: 503 },
    );
  }

  try {
    const ctx = await browser.newContext();
    await ctx.addCookies(cookieList);
    const page = await ctx.newPage();
    await page.goto(printUrl, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });
    await ctx.close();

    const filename = `${terminalRow.slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
    // Copy the playwright Uint8Array (typed against ArrayBufferLike) into
    // a fresh ArrayBuffer so the BodyInit signature accepts it.
    const ab = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(ab).set(pdf);
    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "pdf_render_failed",
            message:
              e instanceof Error
                ? e.message
                : "PDF rendering failed",
          },
        ],
      },
      { status: 500 },
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export const GET = withObservability<Props>(handle, "GET /api/v1/projects/:ticker/export.pdf");
