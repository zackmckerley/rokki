"use client";

import { useEffect, useRef, useState } from "react";

export interface Gif {
  id: string;
  description: string;
  preview: string;
  url: string;
}

/** Searchable Tenor GIF grid. Picking a GIF hands its media URL back to the
 *  composer, which downloads it (via our proxy) and sends it as an image. */
function GifGrid({
  onPick,
  onClose,
}: {
  onPick: (g: Gif) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const [unconfigured, setUnconfigured] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    const t = setTimeout(() => {
      fetch(`/api/v1/gif/search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
      })
        .then(async (r) => {
          if (r.status === 503) {
            if (alive) setUnconfigured(true);
            return { data: [] };
          }
          if (!r.ok) {
            // A server/proxy error is NOT an empty result — surface it.
            if (alive) setError(true);
            return { data: [] };
          }
          return r.json();
        })
        .then((b: { data?: Gif[] }) => {
          if (alive) setResults(b.data ?? []);
        })
        .catch(() => {
          if (alive) {
            setError(true);
            setResults([]);
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-md border border-border bg-bg-1 shadow-lg"
    >
      <div className="border-b border-border p-1.5">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search GIFs"
          className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
        />
      </div>
      <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto p-1.5">
        {unconfigured ? (
          <p className="col-span-2 px-2 py-6 text-center text-2xs text-text-3">
            GIF search isn’t set up yet — add a Tenor API key.
          </p>
        ) : error ? (
          <p className="col-span-2 py-6 text-center text-2xs text-text-3">
            Couldn’t reach GIF search.
          </p>
        ) : loading && results.length === 0 ? (
          <p className="col-span-2 py-6 text-center text-2xs text-text-3">
            Searching…
          </p>
        ) : results.length === 0 ? (
          <p className="col-span-2 py-6 text-center text-2xs text-text-3">
            No GIFs found.
          </p>
        ) : (
          results.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onPick(g)}
              aria-label={g.description || "Insert GIF"}
              className="aspect-square overflow-hidden rounded-sm bg-bg-2 hover:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.preview}
                alt={g.description}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))
        )}
      </div>
      <div className="border-t border-border bg-bg-0 px-2 py-0.5 text-right text-[9px] text-text-3">
        via Tenor
      </div>
    </div>
  );
}

/** The GIF trigger button + popover. */
export function GifButton({ onPick }: { onPick: (g: Gif) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="GIF"
        aria-label="Insert GIF"
        className="flex h-full items-center rounded-sm border border-border bg-bg-0 px-1.5 text-2xs font-bold text-text-2 hover:text-text-0"
      >
        GIF
      </button>
      {open ? (
        <GifGrid
          onPick={(g) => {
            onPick(g);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
