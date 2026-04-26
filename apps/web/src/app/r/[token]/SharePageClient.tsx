"use client";

import { useEffect, useState } from "react";
import { Download, AlertTriangle, FileText } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

interface ShareResponse {
  filename: string;
  mime_type: string;
  size_bytes: number;
  url: string;
}

/**
 * Public share-link view. Two states:
 *   - email gate (if the link requires_email)
 *   - loaded: inline preview for PDFs + images, download link otherwise
 *
 * Error states surface the reason the link didn't work (expired, revoked,
 * view-cap reached) so the viewer knows what to do.
 */
export function SharePageClient({ token }: { token: string }) {
  const [data, setData] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [needsEmail, setNeedsEmail] = useState(false);

  async function load(viewerEmail?: string) {
    setLoading(true);
    setError(null);
    try {
      const url = viewerEmail
        ? `/api/v1/share/${token}?email=${encodeURIComponent(viewerEmail)}`
        : `/api/v1/share/${token}`;
      const r = await fetch(url);
      const body = (await r.json()) as {
        data?: ShareResponse;
        errors?: { code: string; message: string }[];
      };
      if (!r.ok || !body.data) {
        const e = body.errors?.[0] ?? {
          code: "unknown",
          message: "Something went wrong.",
        };
        if (e.code === "email_required") {
          setNeedsEmail(true);
          setError(null);
        } else {
          setError(e);
        }
        return;
      }
      setData(body.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  const isPdf = data?.mime_type === "application/pdf";
  const isImage = data?.mime_type?.startsWith("image/");

  async function recordDownload() {
    void fetch(
      `/api/v1/share/${token}?download=1${
        email ? `&email=${encodeURIComponent(email)}` : ""
      }`,
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <header className="flex h-11 flex-shrink-0 items-center border-b border-border bg-bg-1 px-4">
        <Wordmark size="md" />
        <span className="ml-3 text-xs text-text-3">
          Shared via Rokki
        </span>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-6">
        {loading ? (
          <p className="py-20 text-center text-sm text-text-3">Loading…</p>
        ) : error ? (
          <div className="mx-auto max-w-md rounded border border-danger-subtle bg-danger-subtle p-6 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-danger" />
            <h1 className="mt-3 text-lg font-semibold text-text-0">
              {error.message}
            </h1>
            <p className="mt-2 text-xs text-text-3">
              If you think this is a mistake, ask the person who shared it.
            </p>
          </div>
        ) : needsEmail ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load(email.trim());
            }}
            className="mx-auto flex w-full max-w-md flex-col gap-3 rounded border border-border bg-bg-1 p-6"
          >
            <h1 className="text-base font-semibold text-text-0">
              Before you view
            </h1>
            <p className="text-xs text-text-3">
              The owner asked viewers to identify themselves with an email.
              This is logged; no marketing.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="rounded-sm border border-border bg-bg-0 px-3 py-2 text-sm text-text-0 outline-none focus:border-border-focus"
            />
            <button
              type="submit"
              className="rounded-sm bg-accent px-3 py-2 text-sm text-bg-0 hover:opacity-90"
            >
              Continue
            </button>
          </form>
        ) : data ? (
          <>
            <div className="mb-4 flex items-center gap-3 text-sm">
              <FileText className="h-3.5 w-3.5 text-text-3" aria-hidden="true" />
              <span className="flex-1 truncate font-mono text-text-1">
                {data.filename}
              </span>
              <span className="font-mono text-[11px] text-text-3">
                {humanSize(data.size_bytes)}
              </span>
              <a
                href={data.url}
                onClick={() => void recordDownload()}
                download={data.filename}
                className="flex items-center gap-1 rounded-sm bg-accent px-3 py-1 text-xs text-bg-0 hover:opacity-90"
              >
                <Download className="h-3 w-3" /> Download
              </a>
            </div>
            <div className="min-h-[500px] rounded border border-border bg-bg-1">
              {isPdf ? (
                <iframe
                  title={data.filename}
                  src={data.url}
                  className="h-[80vh] w-full rounded"
                />
              ) : isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.url}
                  alt={data.filename}
                  className="mx-auto max-h-[80vh]"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-12 text-center">
                  <div>
                    <FileText
                      className="mx-auto h-8 w-8 text-text-3"
                      aria-hidden="true"
                    />
                    <p className="mt-3 text-sm text-text-2">
                      Preview isn&apos;t available for this file type.
                    </p>
                    <a
                      href={data.url}
                      onClick={() => void recordDownload()}
                      download={data.filename}
                      className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
                    >
                      <Download className="h-3 w-3" /> Download to view
                    </a>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
      <footer className="flex h-8 items-center justify-center border-t border-border bg-bg-1 text-[11px] text-text-3">
        This link may expire. Powered by Rokki.
      </footer>
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
