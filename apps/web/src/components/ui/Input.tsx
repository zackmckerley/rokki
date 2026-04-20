import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  monospace?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, monospace, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1">
        {label ? (
          <label htmlFor={inputId} className="text-xs font-medium text-text-1">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-9 rounded border bg-bg-2 px-3 text-sm text-text-0 placeholder:text-text-3",
            "focus:border-border-focus focus:outline-none",
            error ? "border-danger" : "border-border",
            monospace && "font-mono",
            className,
          )}
          {...props}
        />
        {error ? (
          <span className="text-xs text-danger">{error}</span>
        ) : hint ? (
          <span className="text-xs text-text-2">{hint}</span>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";
