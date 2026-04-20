import { cn } from "@/lib/utils";

interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Wordmark({ size = "md", className }: WordmarkProps) {
  const sizeClass = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  }[size];

  return (
    <span
      className={cn(
        "select-none font-sans font-semibold lowercase text-text-0",
        sizeClass,
        className,
      )}
      style={{ letterSpacing: "-0.02em" }}
      aria-label="Rokki"
    >
      rokki
    </span>
  );
}
