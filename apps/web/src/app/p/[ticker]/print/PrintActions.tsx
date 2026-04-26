"use client";

import { useEffect, useState } from "react";
import { Printer, Download, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Props {
  ticker: string;
}

/**
 * Sticky action bar at the top of the dedicated print page. Hidden on
 * print via @media print so it never shows up on the printed sheet.
 *
 * Behaviour:
 *   - "Print / Save as PDF" calls window.print(). The browser's print
 *     dialog has a "Save as PDF" destination on every modern OS, which
 *     gives us PDF export without any server-side puppeteer footprint.
 *   - "Download PDF" calls the (placeholder) server-side endpoint.
 *     Server-side PDF needs a Playwright runner that can run inside the
 *     Vercel build. Until that infra lands the endpoint returns 503 and
 *     we surface the error inline. The button stays visible so the
 *     feature is discoverable when infra catches up.
 *   - Auto-print: when ?auto=1 we trigger window.print() once after
 *     mount, useful for a "Send to printer immediately" deep link.
 */
export function PrintActions({ ticker }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("auto") === "1") {
      // Defer one tick so the page paints first; otherwise the print
      // preview shows a blank flash on slower machines.
      const t = window.setTimeout(() => window.print(), 200);
      return () => window.clearTimeout(t);
    }
  }, []);

  async function downloadPdf() {
    setServerError(null);
    setDownloading(true);
    try {
      const r = await fetch(`/api/v1/projects/${ticker}/export.pdf`, {
        credentials: "include",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setServerError(
          body.errors?.[0]?.message ??
            "Server PDF export is not available in this environment.",
        );
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticker}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Network error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      data-print-hide="true"
      className="sticky top-0 z-10 mb-4 -mx-6 flex items-center justify-between gap-2 border-b border-border bg-bg-1 px-6 py-2 print:hidden"
    >
      <Link
        href={`/p/${ticker}`}
        className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to terminal
      </Link>
      <div className="flex items-center gap-2">
        {serverError ? (
          <span className="rounded-sm border border-warning/40 bg-warning-subtle px-2 py-1 text-[10px] text-warning">
            {serverError}
          </span>
        ) : null}
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-3 py-1 text-xs text-text-1 hover:bg-bg-3 disabled:opacity-50"
        >
          <Download className="h-3 w-3" />
          {downloading ? "Generating…" : "Download PDF (server)"}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1 rounded-sm border border-accent bg-accent px-3 py-1 text-xs font-semibold text-bg-0 hover:bg-accent-hover"
        >
          <Printer className="h-3 w-3" />
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
