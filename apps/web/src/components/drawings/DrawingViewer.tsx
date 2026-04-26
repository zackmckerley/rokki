"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  MessageSquare,
  Check,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/primitives";
import { useRealtimeTable } from "@/lib/supabase/realtime";

/* react-pdf is browser-only and pulls in ~1.5 MB. Lazy import so the rest
 * of the UI stays fast and it only loads on this screen. The <any> generic
 * is intentional — react-pdf's props are loose and not worth re-typing. */
const Document = dynamic<any>(
  () => import("react-pdf").then((m) => m.Document),
  { ssr: false },
);
const Page = dynamic<any>(() => import("react-pdf").then((m) => m.Page), {
  ssr: false,
});

// Configure the PDF.js worker once. Using the CDN-hosted worker keeps the
// Next build tree-shakeable; swap to a local worker in a later deploy slice.
if (typeof window !== "undefined") {
  void import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  });
}

interface Annotation {
  id: string;
  page_number: number;
  x_pct: number;
  y_pct: number;
  body: string;
  color: "accent" | "success" | "warning" | "danger";
  created_by: string;
  created_at: string;
  resolved_at: string | null;
  author_name: string | null;
}

interface DrawingViewerProps {
  fileId: string;
  filename: string;
  currentUserId: string;
}

/**
 * PDF drawing viewer + pinnable annotations.
 *
 * Toolbar: prev/next page, zoom in/out, "Annotate mode" toggle. Clicking
 * the page while Annotate is on captures the normalized (x_pct, y_pct)
 * coordinate and opens a draft popover. Clicking an existing pin opens its
 * thread. Pins are live across collaborators via Realtime.
 */
export function DrawingViewer({
  fileId,
  filename,
  currentUserId,
}: DrawingViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draftAt, setDraftAt] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Fetch a short-lived signed URL for the PDF.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/v1/files/${fileId}/signed-url`, {
      credentials: "include",
    })
      .then((r) => r.json() as Promise<{ data?: { url: string } }>)
      .then((body) => {
        if (!cancelled && body.data?.url) setSignedUrl(body.data.url);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // Load annotations.
  const loadAnnotations = useCallback(async () => {
    const r = await fetch(`/api/v1/drawings/${fileId}/annotations`, {
      credentials: "include",
    });
    if (!r.ok) return;
    const body = (await r.json()) as { data?: Annotation[] };
    setAnnotations(body.data ?? []);
  }, [fileId]);
  useEffect(() => {
    void loadAnnotations();
  }, [loadAnnotations]);

  useRealtimeTable<{ id: string; file_id: string }>(
    {
      table: "drawing_annotations",
      filter: `file_id=eq.${fileId}`,
      channelKey: `ann:${fileId}`,
    },
    {
      onInsert: () => void loadAnnotations(),
      onUpdate: () => void loadAnnotations(),
      onDelete: () => void loadAnnotations(),
    },
  );

  const onPageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!annotateMode) return;
      if (!pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      setDraftAt({ x, y });
      setDraftText("");
    },
    [annotateMode],
  );

  async function submitDraft() {
    if (!draftAt || !draftText.trim()) {
      setDraftAt(null);
      return;
    }
    await fetch(`/api/v1/drawings/${fileId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        page_number: page,
        x_pct: draftAt.x,
        y_pct: draftAt.y,
        body: draftText.trim(),
      }),
    });
    setDraftAt(null);
    setDraftText("");
    await loadAnnotations();
  }

  async function resolveAnnotation(id: string, resolved: boolean) {
    await fetch(`/api/v1/drawings/annotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ resolved }),
    });
    await loadAnnotations();
  }
  async function deleteAnnotation(id: string) {
    if (!confirm("Delete this annotation?")) return;
    await fetch(`/api/v1/drawings/annotations/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setSelectedId(null);
    await loadAnnotations();
  }

  const currentPageAnnotations = useMemo(
    () => annotations.filter((a) => a.page_number === page),
    [annotations, page],
  );
  const selectedAnnotation = annotations.find((a) => a.id === selectedId);

  return (
    <div className="flex h-full flex-col rounded border border-border bg-bg-0">
      <header className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-1 px-3 text-xs">
        <span className="truncate font-mono text-text-1">{filename}</span>
        <span className="text-text-3">·</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
            className="rounded-sm p-1 text-text-2 hover:bg-bg-2 hover:text-text-0 disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="font-mono text-[11px] text-text-2">
            {page} / {numPages || "–"}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            aria-label="Next page"
            className="rounded-sm p-1 text-text-2 hover:bg-bg-2 hover:text-text-0 disabled:opacity-40"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <span className="text-text-3">·</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            aria-label="Zoom out"
            className="rounded-sm p-1 text-text-2 hover:bg-bg-2 hover:text-text-0"
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <span className="font-mono text-[11px] text-text-3">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(4, z + 0.2))}
            aria-label="Zoom in"
            className="rounded-sm p-1 text-text-2 hover:bg-bg-2 hover:text-text-0"
          >
            <ZoomIn className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setAnnotateMode((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[11px]",
            annotateMode
              ? "border-accent bg-accent-subtle text-accent"
              : "bg-bg-2 text-text-1 hover:bg-bg-3",
          )}
        >
          <MessageSquare className="h-2.5 w-2.5" />
          {annotateMode ? "Annotating — click the drawing" : "Annotate"}
        </button>
      </header>

      <div className="flex-1 overflow-auto bg-bg-2 p-4">
        <div className="mx-auto" style={{ width: "fit-content" }}>
          <div
            ref={pageRef}
            onClick={onPageClick}
            className={cn(
              "relative",
              annotateMode ? "cursor-crosshair" : "cursor-default",
            )}
          >
            {signedUrl ? (
              <Document
                file={signedUrl}
                onLoadSuccess={(doc: { numPages: number }) =>
                  setNumPages(doc.numPages)
                }
                loading={
                  <div className="flex h-[600px] w-[800px] items-center justify-center text-sm text-text-3">
                    Loading PDF…
                  </div>
                }
                error={
                  <div className="flex h-[200px] w-[400px] items-center justify-center rounded border border-danger-subtle bg-danger-subtle p-4 text-sm text-danger">
                    Could not load this file.
                  </div>
                }
              >
                <Page
                  pageNumber={page}
                  scale={zoom}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
              </Document>
            ) : (
              <div className="flex h-[600px] w-[800px] items-center justify-center text-sm text-text-3">
                Preparing…
              </div>
            )}

            {/* Pins */}
            {currentPageAnnotations.map((a) => (
              <AnnotationPin
                key={a.id}
                a={a}
                active={a.id === selectedId}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(a.id === selectedId ? null : a.id);
                }}
              />
            ))}

            {/* Draft pin */}
            {draftAt ? (
              <div
                className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
                style={{ left: `${draftAt.x * 100}%`, top: `${draftAt.y * 100}%` }}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg-0">
                  ?
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Draft popover */}
      {draftAt ? (
        <div className="border-t border-border bg-bg-1 p-3">
          <div className="flex items-center gap-2">
            <textarea
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraftAt(null);
                  setDraftText("");
                }
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void submitDraft();
                }
              }}
              placeholder="New annotation. ⌘↵ to post, Esc to cancel."
              className="h-14 flex-1 resize-none rounded-sm border border-border bg-bg-0 p-2 text-xs text-text-0 outline-none focus:border-border-focus"
            />
            <button
              onClick={submitDraft}
              disabled={!draftText.trim()}
              className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-xs text-bg-0 disabled:opacity-40"
            >
              <Check className="h-3 w-3" /> Pin
            </button>
            <button
              onClick={() => {
                setDraftAt(null);
                setDraftText("");
              }}
              aria-label="Cancel"
              className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Detail popover for a selected pin */}
      {selectedAnnotation ? (
        <div className="border-t border-border bg-bg-1 p-3">
          <div className="flex items-start gap-3">
            <Avatar
              name={selectedAnnotation.author_name}
              size="sm"
            />
            <div className="flex-1 min-w-0 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-0">
                  {selectedAnnotation.author_name ?? "someone"}
                </span>
                <span className="text-text-3">
                  · {new Date(selectedAnnotation.created_at).toLocaleString()}
                </span>
                {selectedAnnotation.resolved_at ? (
                  <span className="rounded-sm bg-success-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-success">
                    Resolved
                  </span>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-text-1">
                {selectedAnnotation.body}
              </p>
            </div>
            <button
              onClick={() =>
                resolveAnnotation(
                  selectedAnnotation.id,
                  !selectedAnnotation.resolved_at,
                )
              }
              className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-text-1 hover:bg-bg-2"
            >
              {selectedAnnotation.resolved_at ? "Reopen" : "Resolve"}
            </button>
            {selectedAnnotation.created_by === currentUserId ? (
              <button
                onClick={() => deleteAnnotation(selectedAnnotation.id)}
                aria-label="Delete annotation"
                className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-danger"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : null}
            <button
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnnotationPin({
  a,
  active,
  onClick,
}: {
  a: Annotation;
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const color: Record<Annotation["color"], string> = {
    accent: "bg-accent text-bg-0",
    success: "bg-success text-bg-0",
    warning: "bg-warning text-bg-0",
    danger: "bg-danger text-bg-0",
  };
  return (
    <button
      onClick={onClick}
      aria-label={`Annotation by ${a.author_name ?? "someone"}`}
      className={cn(
        "absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold shadow-sm transition-transform hover:scale-110",
        a.resolved_at ? "opacity-50" : "",
        color[a.color],
        active && "ring-2 ring-border-focus ring-offset-1",
      )}
      style={{ left: `${a.x_pct * 100}%`, top: `${a.y_pct * 100}%` }}
    >
      💬
    </button>
  );
}
