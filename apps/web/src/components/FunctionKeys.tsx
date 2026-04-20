"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

export interface FunctionKey {
  key: string;
  label: string;
  href?: string;
  disabled?: boolean;
}

interface FunctionKeysProps {
  keys: FunctionKey[];
  active?: string;
  onSelect?: (key: string) => void;
}

export function FunctionKeys({ keys, active, onSelect }: FunctionKeysProps) {
  useEffect(() => {
    if (!onSelect) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (/^F([2-9]|1[0-2])$/.test(e.key)) {
        const match = keys.find((k) => k.key === e.key && !k.disabled);
        if (match) {
          e.preventDefault();
          onSelect(match.key);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keys, onSelect]);

  return (
    <div
      className="flex h-8 items-center gap-0 overflow-x-auto border-b border-border bg-bg-1 px-1"
      role="tablist"
      aria-label="Function keys"
    >
      {keys.map((k) => (
        <button
          key={k.key}
          role="tab"
          aria-selected={active === k.key}
          disabled={k.disabled}
          onClick={() => onSelect?.(k.key)}
          className={cn(
            "flex h-full items-center gap-1.5 px-2 text-xs transition-colors",
            "focus-visible:outline-none focus-visible:bg-bg-3",
            active === k.key
              ? "text-accent"
              : "text-text-2 hover:text-text-0 hover:bg-bg-2",
            k.disabled && "opacity-30 cursor-not-allowed",
          )}
        >
          <kbd className="font-mono text-[10px] font-semibold">{k.key}</kbd>
          <span>{k.label}</span>
        </button>
      ))}
    </div>
  );
}
