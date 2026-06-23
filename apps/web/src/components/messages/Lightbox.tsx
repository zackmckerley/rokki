"use client";

import { useCallback, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { ChatAttachment } from "./ChatThread";

/**
 * Full-screen image viewer with prev/next + keyboard nav (Esc / ← / →), shared
 * by the dashboard Messages card and the full-page Signal view so tapping an
 * image behaves identically on both surfaces.
 */
export function Lightbox({
  items,
  index,
  onClose,
  onNav,
}: {
  items: ChatAttachment[];
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
}) {
  const current = items[index];
  const go = useCallback(
    (delta: number) => onNav((index + delta + items.length) % items.length),
    [index, items.length, onNav],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);
  if (!current?.url) return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {items.length > 1 ? (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            go(-1);
          }}
          aria-label="Previous"
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.url}
        alt={current.filename ?? "image"}
        onClick={stop}
        className="max-h-full max-w-full rounded object-contain"
      />
      {items.length > 1 ? (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            go(1);
          }}
          aria-label="Next"
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      ) : null}
      <a
        href={current.url}
        download={current.filename ?? "image"}
        onClick={stop}
        className="absolute bottom-4 flex items-center gap-1.5 rounded-sm bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
      >
        <Download className="h-3.5 w-3.5" /> Download
      </a>
    </div>
  );
}
