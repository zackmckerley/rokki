import Link from "next/link";
import { File, FileSpreadsheet, Image as ImageIcon, FileText } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { TickerChip } from "@/components/primitives";
import { formatFileSize, type ScopedFileRow } from "@/lib/modules/files-queries";

interface Props {
  files: ScopedFileRow[];
  title: string;
}

/**
 * Read-only list of files scoped to a space or terminal. Each row
 * deep-links into the existing per-terminal file viewer. Phase 1
 * MVP — no upload, no folder tree, no inline preview.
 */
export function ScopedFileList({ files, title }: Props) {
  return (
    <DashboardCard
      title={title}
      count={files.length}
      expandHref={null}
      className="m-2 sm:m-3"
    >
      {files.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-text-3">
          No files at this scope yet. Upload from a terminal&apos;s Files panel.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {files.map((f) => {
            const Icon = iconFor(f.mime_type, f.filename);
            const href = f.terminal_ticker
              ? `/p/${f.terminal_ticker}#file=${f.id}`
              : undefined;
            const row = (
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-bg-2">
                <Icon
                  className="h-3 w-3 flex-shrink-0 text-text-3"
                  aria-hidden="true"
                />
                {f.terminal_ticker ? (
                  <TickerChip>{f.terminal_ticker}</TickerChip>
                ) : null}
                <span className="flex-1 truncate text-text-0">
                  {f.filename}
                </span>
                <span className="hidden font-mono text-[10px] text-text-3 md:inline">
                  {f.folder === "/" ? "/" : f.folder}
                </span>
                <span className="font-mono text-[10px] text-text-3">
                  {formatFileSize(f.size_bytes)}
                </span>
              </div>
            );
            return (
              <li key={f.id}>
                {href ? (
                  <Link href={href} className="block">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}

/** Pick the right Lucide icon for a file type. */
function iconFor(mime: string, filename: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf") return FileText;
  if (
    mime === "application/vnd.ms-excel" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    filename.endsWith(".csv")
  )
    return FileSpreadsheet;
  if (mime.startsWith("text/")) return FileText;
  return File;
}
