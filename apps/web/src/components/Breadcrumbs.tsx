import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  /** Visible label. */
  label: string;
  /**
   * Path to navigate to. Omit for the current/leaf crumb (rendered as
   * non-interactive text). Always omit on the last entry.
   */
  href?: string;
}

/**
 * Inline orientation breadcrumbs. Bloomberg-dense — no big arrow,
 * no centered hero. Sits at the top of a deep page and gives the user
 * a one-glance answer to "where am I?" plus one-click jumps back up
 * the hierarchy.
 *
 * Pattern:
 *   <Breadcrumbs items={[
 *     { label: "Admin", href: "/admin" },
 *     { label: "Spaces", href: "/admin/spaces" },
 *     { label: "Acme Corp" },
 *   ]} />
 *
 * The leaf (last item) has no href and is rendered in text-text-1.
 * Earlier items are text-text-3 with a hover that bumps to text-text-1.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-1 text-xs text-text-3",
        className,
      )}
    >
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 ? (
                <ChevronRight
                  className="h-3 w-3 flex-shrink-0 text-text-3"
                  aria-hidden="true"
                />
              ) : null}
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  className="rounded-sm px-0.5 hover:text-text-1"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "px-0.5",
                    isLast ? "font-medium text-text-1" : "text-text-3",
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
