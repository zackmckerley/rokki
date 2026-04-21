"use client";

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Announcement {
  id: string;
  body: string;
  audience: string;
  dismissible: boolean;
  ends_at: string | null;
  dismissed: boolean;
}

/**
 * Mounted at the layout root. Fetches active announcements once on mount
 * and shows the most recent visible+undismissed one. Dismiss POSTs back
 * to the server and hides immediately.
 *
 * Stays out of the way: a thin strip above the TopBar with markdown body.
 */
export function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[] | null>(null);

  useEffect(() => {
    fetch("/api/v1/me/announcements", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b: { data?: Announcement[] }) => setItems(b.data ?? []))
      .catch(() => setItems([]));
  }, []);

  const active = items?.find((a) => !a.dismissed) ?? null;
  if (!active) return null;

  async function dismiss(id: string) {
    setItems((prev) =>
      (prev ?? []).map((a) => (a.id === id ? { ...a, dismissed: true } : a)),
    );
    await fetch(`/api/v1/me/announcements/${id}/dismiss`, {
      method: "POST",
      credentials: "include",
    });
  }

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-accent/40 bg-accent-subtle/40 px-4 py-1.5 text-xs text-text-1"
    >
      <Megaphone className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent" />
      <div className="flex-1 prose-sm">
        <ReactMarkdown
          components={{
            a: ({ children, href }) => (
              <a
                href={href}
                className="underline hover:text-accent"
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            ),
            p: ({ children }) => <span>{children}</span>,
          }}
        >
          {active.body}
        </ReactMarkdown>
      </div>
      {active.dismissible ? (
        <button
          type="button"
          onClick={() => void dismiss(active.id)}
          aria-label="Dismiss announcement"
          className="rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
