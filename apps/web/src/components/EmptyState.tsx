import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Lucide icon shape — `LucideIcon` is technically `ForwardRefExoticComponent
 * <Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>`. Accepting just
 * `ComponentType<SVGProps<SVGSVGElement>>` lets callers pass any lucide icon
 * directly without a typecast and stays plain SVG so unit tests render fine.
 */
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface EmptyStateAction {
  label: string;
  /** href OR onClick — pass exactly one. */
  href?: string;
  onClick?: () => void;
  /** Use accent treatment instead of default. */
  variant?: "accent" | "default";
  /** Optional shortcut hint shown next to the label. */
  shortcut?: string;
}

interface EmptyStateProps {
  /** Lucide icon component (rendered at h-8 w-8 in `text-text-3`). */
  icon: IconComponent;
  /** One short sentence — fragment of action plus subject. */
  title: string;
  /** Optional helper sentence. Single line, no marketing fluff. */
  body?: ReactNode;
  /** Primary CTA. Omit if there's nothing the user can do. */
  action?: EmptyStateAction;
  /** Optional secondary CTA. */
  secondaryAction?: EmptyStateAction;
  /** Padding override. Defaults to dense p-8. */
  className?: string;
}

/**
 * Centered empty state — the project-wide replacement for "No items yet"
 * paragraphs. Matches §08.5 dense card aesthetic: mono-feeling icon, small
 * title, smaller body, primary CTA in the AdminButton style.
 *
 * Use the smallest possible action surface — no marketing fluff. If you
 * can't think of a useful next step, omit the action entirely.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
    >
      <Icon className="h-8 w-8 text-text-3" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-text-1">{title}</p>
        {body ? (
          <p className="max-w-sm text-xs text-text-3">{body}</p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action ? <ActionButton action={action} /> : null}
          {secondaryAction ? (
            <ActionButton action={secondaryAction} variantOverride="default" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  action,
  variantOverride,
}: {
  action: EmptyStateAction;
  variantOverride?: "default";
}) {
  const v = variantOverride ?? action.variant ?? "default";
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
    v === "accent"
      ? "border-accent bg-accent-subtle text-accent hover:bg-accent/20"
      : "border-border bg-bg-2 text-text-1 hover:bg-bg-3",
  );

  const inner = (
    <>
      <span>{action.label}</span>
      {action.shortcut ? (
        <kbd className="ml-1 rounded-sm border border-border bg-bg-0 px-1 font-mono text-[10px] text-text-3">
          {action.shortcut}
        </kbd>
      ) : null}
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {inner}
    </button>
  );
}
