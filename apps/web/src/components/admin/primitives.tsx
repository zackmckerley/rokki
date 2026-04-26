"use client";

import { Copy, Check as CheckIcon, Inbox } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";

/**
 * Shared primitives for `/admin/*` pages. Goal: functional, dense, no
 * visual novelty. If it doesn't exist here, every page is reinventing the
 * same table header.
 */

export function AdminSectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl text-text-0">{title}</h1>
        {description ? (
          <p className="mt-1 text-xs text-text-3">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function AdminPanel({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded border border-border bg-bg-1",
        className,
      )}
    >
      {title ? (
        <header className="border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
          {title}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function AdminBadge({
  variant = "muted",
  children,
}: {
  variant?: "muted" | "accent" | "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    muted: "border-border bg-bg-2 text-text-2",
    accent: "border-accent/40 bg-accent-subtle text-accent",
    success: "border-success/40 bg-success-subtle text-success",
    warning: "border-warning/40 bg-warning-subtle text-warning",
    danger: "border-danger/40 bg-danger-subtle text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        styles[variant] ?? styles.muted,
      )}
    >
      {children}
    </span>
  );
}

export function AdminCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-label={`Copy ${value}`}
      title={value}
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-text-3 hover:bg-bg-3 hover:text-text-0"
    >
      {copied ? (
        <CheckIcon className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

/**
 * A narrow wrapper around a simple HTML table. Consumer supplies the
 * `<thead>` and `<tbody>`. Benefits: consistent border + header styling
 * in one place, plus built-in scroll behavior.
 */
export function AdminTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded border border-border bg-bg-1",
        className,
      )}
    >
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function AdminTh({
  children,
  className,
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function AdminTd({
  children,
  className,
  align = "left",
  mono = false,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2",
        align === "right" ? "text-right" : "text-left",
        mono ? "font-mono text-xs text-text-2" : "text-text-1",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function AdminEmpty({
  children,
  body,
  action,
  panel = false,
}: {
  /** Title — short, sentence form. */
  children: React.ReactNode;
  /** Optional helper line. */
  body?: React.ReactNode;
  /** Optional CTA — pass `{ label, href }` or `{ label, onClick }`. */
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
    variant?: "accent" | "default";
  };
  /**
   * Wrap in a dashed-border panel. Set when used at top level (between
   * AdminSectionHeader and the main content). Leave false when nested
   * inside an `AdminPanel` so we don't double up borders.
   */
  panel?: boolean;
}) {
  const inner = (
    <EmptyState
      icon={Inbox}
      title={typeof children === "string" ? children : String(children)}
      body={body}
      action={action}
    />
  );
  if (panel) {
    return (
      <div className="rounded border border-dashed border-border bg-bg-1">
        {inner}
      </div>
    );
  }
  return inner;
}

export function AdminButton({
  variant = "default",
  disabled,
  onClick,
  type = "button",
  title,
  children,
  className,
}: {
  variant?: "default" | "accent" | "danger" | "subtle";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const styles: Record<string, string> = {
    default:
      "border-border bg-bg-2 text-text-1 hover:bg-bg-3",
    subtle:
      "border-transparent bg-transparent text-text-2 hover:bg-bg-2 hover:text-text-0",
    accent:
      "border-accent bg-accent-subtle text-accent hover:bg-accent/20",
    danger:
      "border-danger/40 bg-danger-subtle text-danger hover:bg-danger/20",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[variant] ?? styles.default,
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
