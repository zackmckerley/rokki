import { cn } from "@/lib/utils";

export interface SkeletonColumn {
  /** Column header label — ignored visually but kept in markup for a11y. */
  label: string;
  /**
   * Tailwind width utility for the placeholder bar in this column. Picked
   * by the caller so the skeleton matches the real table's column widths.
   * E.g. "w-32" for a name column, "w-16" for a status pill.
   */
  width: string;
  /** Right-align the placeholder cell (numeric columns). */
  align?: "left" | "right";
  /** Render the bar in mono-ish (slightly narrower) for ID/ticker columns. */
  mono?: boolean;
}

interface TableSkeletonProps {
  /** Number of fake rows to render. Defaults to 6. */
  rows?: number;
  /** Column shape — must match the real table for the layout to stay still. */
  columns: SkeletonColumn[];
  /** Optional title shown in the panel header strip (matches AdminPanel). */
  title?: string;
  /** Optional className passed to the outer panel. */
  className?: string;
}

/**
 * Reusable table-shaped loading state. Renders pulsing `bg-bg-3` placeholder
 * blocks at the column widths the caller specifies, so when real data lands
 * the layout doesn't jump.
 *
 * Pair with the real table by lifting a single `columns` array next to both
 * — keeps the widths in sync.
 */
export function TableSkeleton({
  rows = 6,
  columns,
  title,
  className,
}: TableSkeletonProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded border border-border bg-bg-1",
        className,
      )}
      aria-busy="true"
      aria-label="Loading"
    >
      {title ? (
        <header className="border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
          {title}
        </header>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-3 py-2.5",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-3 animate-pulse rounded-sm bg-bg-3",
                        c.width,
                        c.mono && "h-2.5",
                      )}
                      aria-hidden="true"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface CardSkeletonProps {
  /** Optional className passthrough for layout overrides. */
  className?: string;
  /**
   * Optional row count. When supplied, the component renders a
   * dashboard-card-style placeholder (header chip + N stacked rows)
   * instead of the default single stat-tile. The two shapes share
   * one export so loading skeletons don't have to import two
   * different components for the same visual purpose.
   */
  rows?: number;
}

/**
 * Stat-tile skeleton matching the cards on the admin overview. Same border,
 * padding, and inner stack as `Stat` in `app/admin/page.tsx` so the page
 * doesn't shift when real numbers load.
 *
 * When `rows` is provided, renders a card-with-list shape instead —
 * used by dashboard / space / messages loading skeletons.
 */
export function CardSkeleton({ className, rows }: CardSkeletonProps) {
  if (typeof rows === "number" && rows > 0) {
    return (
      <div
        className={cn(
          "flex flex-col gap-1 rounded border border-border bg-bg-1 p-3",
          className,
        )}
        aria-busy="true"
        aria-label="Loading"
      >
        <span className="mb-1 h-3 w-24 animate-pulse rounded-sm bg-bg-3" />
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 py-1"
          >
            <span className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-bg-3" />
            <span className="h-3 flex-1 animate-pulse rounded-sm bg-bg-3" />
            <span className="h-3 w-12 animate-pulse rounded-sm bg-bg-3" />
          </div>
        ))}
      </div>
    );
  }
  return CardStatSkeleton({ className });
}

function CardStatSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded border border-border bg-bg-1 p-3",
        className,
      )}
      aria-busy="true"
      aria-label="Loading"
    >
      <span
        className="mt-1 h-4 w-4 animate-pulse rounded-sm bg-bg-3"
        aria-hidden="true"
      />
      <span className="flex flex-col gap-1.5">
        <span
          className="h-6 w-16 animate-pulse rounded-sm bg-bg-3"
          aria-hidden="true"
        />
        <span
          className="h-2 w-20 animate-pulse rounded-sm bg-bg-3"
          aria-hidden="true"
        />
      </span>
    </div>
  );
}

interface AdminSectionHeaderSkeletonProps {
  /** Pulsed-bar width for the title. */
  titleWidth?: string;
  /** Pulsed-bar width for the subtitle. */
  descriptionWidth?: string;
  /** Whether to render a pulsed action button on the right. */
  withAction?: boolean;
}

/**
 * Header strip that mirrors `<AdminSectionHeader>` so loading.tsx can show a
 * stable "Title / description / action" row before the real header lands.
 */
export function AdminSectionHeaderSkeleton({
  titleWidth = "w-40",
  descriptionWidth = "w-72",
  withAction = false,
}: AdminSectionHeaderSkeletonProps) {
  return (
    <header
      className="mb-4 flex items-end justify-between gap-3"
      aria-busy="true"
    >
      <div className="flex flex-col gap-2">
        <span
          className={cn("h-6 animate-pulse rounded-sm bg-bg-3", titleWidth)}
          aria-hidden="true"
        />
        <span
          className={cn(
            "h-3 animate-pulse rounded-sm bg-bg-3",
            descriptionWidth,
          )}
          aria-hidden="true"
        />
      </div>
      {withAction ? (
        <span
          className="h-7 w-28 animate-pulse rounded-sm bg-bg-3"
          aria-hidden="true"
        />
      ) : null}
    </header>
  );
}
