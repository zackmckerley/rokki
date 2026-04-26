import { cn } from "@/lib/utils";

export interface FieldHintProps {
  children: React.ReactNode;
  /**
   * Tone — `muted` is the default explanatory copy. `danger` is for
   * field-level errors when the field doesn't go through `<Input />`
   * (e.g. a textarea or a custom picker).
   */
  tone?: "muted" | "danger";
  className?: string;
  id?: string;
}

/**
 * Small helper copy under a form field. The shared `<Input />` component
 * already renders its `hint` and `error` props in this style; use this
 * when the field is a textarea, select, or custom widget that doesn't
 * route through `<Input />`.
 *
 * Sits at 11px so it disappears into the chrome and never competes with
 * the input itself for attention.
 */
export function FieldHint({
  children,
  tone = "muted",
  className,
  id,
}: FieldHintProps) {
  return (
    <span
      id={id}
      className={cn(
        "text-[11px] leading-tight",
        tone === "danger" ? "text-danger" : "text-text-3",
        className,
      )}
    >
      {children}
    </span>
  );
}
