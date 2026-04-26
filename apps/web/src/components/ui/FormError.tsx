import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FormErrorProps {
  /**
   * The message to display. When falsy, the component renders nothing —
   * call sites can pass a state value directly without an outer ternary.
   */
  message: string | null | undefined;
  /**
   * If provided, an X button is shown that invokes the callback. Useful
   * when the error is a non-blocking warning the user can dismiss.
   */
  onDismiss?: () => void;
  /** Extra classes (margins, etc.). */
  className?: string;
}

/**
 * Form-level error banner. Sits at the top of a form and explains what
 * stopped the submission — same visual register as the toast `error`
 * variant so the two read as one family, but inline rather than
 * floating because form errors persist until the user fixes them.
 *
 * For per-field errors use `<Input error="…" />` instead; this is for
 * messages that don't belong to a single field (auth failures, server
 * errors, missing-required-fields summaries).
 */
export function FormError({ message, onDismiss, className }: FormErrorProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-2 text-xs text-danger",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <p className="flex-1 leading-tight">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 rounded-sm p-0.5 text-danger/70 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
