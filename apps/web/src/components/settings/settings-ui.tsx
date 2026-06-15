"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared settings primitives so every settings page (space, modules, …)
 * reads as one product. All styling uses the app's design tokens — the
 * `text-*` / `bg-*` scale, `border-border`, `accent`, and `font-mono`
 * labels — so these match the rest of Rokki, not a bespoke look.
 */

/** A titled card. Header carries the section name + an optional one-line
 *  description and a right-aligned meta/count. Body is whatever you pass. */
export function SettingsCard({
  title,
  description,
  meta,
  children,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded border border-border bg-bg-1">
      <header className="border-b border-border bg-bg-2 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
            {title}
          </h2>
          {meta ? (
            <span className="font-mono text-2xs text-text-3">{meta}</span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1 text-2xs leading-snug text-text-3">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** A label (+ optional description) on the left, a control on the right.
 *  Drop several inside a `<div className="divide-y divide-border">`. */
export function SettingRow({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-xs text-text-1">{label}</div>
        {description ? (
          <div className="mt-0.5 text-2xs leading-snug text-text-3">
            {description}
          </div>
        ) : null}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

/** A real on/off switch in Rokki tokens (accent track when on). */
export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-8 flex-shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        checked ? "border-accent bg-accent" : "border-border bg-bg-3",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full transition-transform",
          checked ? "translate-x-[15px] bg-bg-0" : "translate-x-[2px] bg-text-2",
        )}
      />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** A small segmented control — the same tablist pattern as the Auto/Manual
 *  task toggle, generalised. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <span
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center overflow-hidden rounded-sm border border-border"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-2.5 py-1 font-mono text-2xs uppercase tracking-wide transition-colors",
              active
                ? "bg-bg-3 text-text-0"
                : "text-text-3 hover:bg-bg-2 hover:text-text-1",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/** A page header: a slim breadcrumb plus the title + one-line description.
 *  Shared by the settings pages so they all open the same way. */
export function SettingsHeader({
  breadcrumb,
  title,
  description,
}: {
  breadcrumb?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-5">
      {breadcrumb ? (
        <div className="mb-1.5 flex items-center gap-2 text-2xs text-text-3">
          {breadcrumb}
        </div>
      ) : null}
      <h1 className="text-lg font-semibold text-text-0">{title}</h1>
      {description ? (
        <p className="mt-1 text-xs text-text-3">{description}</p>
      ) : null}
    </header>
  );
}
