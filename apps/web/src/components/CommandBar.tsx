"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, AlertCircle, Check } from "lucide-react";
import { parseCommand, type Parsed } from "@/lib/command-parser";
import { useCommands } from "@/lib/commands";

interface CommandBarProps {
  label?: string;
  onSubmit?: (command: string) => void;
}

/**
 * Terminal command bar — the typed DSL at the bottom of every screen.
 * See `@/lib/command-parser.ts` for syntax.
 *
 * The bar keeps a one-line status after each submit so the user sees
 * "✓ opened BRKL" or "✗ unknown verb". Status clears on next keystroke.
 */
export function CommandBar({ label, onSubmit }: CommandBarProps) {
  const router = useRouter();
  const palette = useCommandsSafe();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    if (onSubmit) {
      onSubmit(value);
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = parseCommand(value);
      const feedback = await dispatch(result, router, () =>
        palette?.open(),
      );
      setStatus(feedback);
      if (feedback.kind === "ok") setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-8 items-center gap-2 border-t border-border bg-bg-1 px-3 font-mono text-xs"
    >
      <span className="font-semibold text-accent">{label ?? "rokki"}</span>
      <ChevronRight className="h-3 w-3 text-text-3" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (status) setStatus(null);
        }}
        placeholder="Type a command…  GO HOME · BRKL F3 · TOOL aerial-reels · /overdue"
        className="flex-1 bg-transparent text-text-0 placeholder:text-text-3 outline-none"
        spellCheck={false}
        autoComplete="off"
        aria-label="Command bar"
        disabled={busy}
      />
      {status ? (
        <span
          className={`flex items-center gap-1 ${
            status.kind === "ok" ? "text-success" : "text-danger"
          }`}
        >
          {status.kind === "ok" ? (
            <Check className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          <span className="truncate">{status.text}</span>
        </span>
      ) : (
        <span className="text-text-3">{nowLabel()}</span>
      )}
    </form>
  );
}

async function dispatch(
  result: Parsed,
  router: ReturnType<typeof useRouter>,
  openPalette?: () => void,
): Promise<{ kind: "ok" | "err"; text: string }> {
  switch (result.kind) {
    case "noop":
      return { kind: "err", text: "empty" };
    case "error":
      return { kind: "err", text: result.message ?? "unrecognized" };
    case "navigate":
      router.push(result.path!);
      return { kind: "ok", text: `→ ${result.path}` };
    case "open_palette":
      // The palette has no pre-fill hook yet; just open. The user types
      // the query themselves. Keep the intent in state for when we do.
      openPalette?.();
      return { kind: "ok", text: "palette opened" };
    case "create_task": {
      const r = await fetch(
        `/api/v1/projects/${result.ticker}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ title: result.task_title }),
        },
      );
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        return {
          kind: "err",
          text: body.errors?.[0]?.message ?? `HTTP ${r.status}`,
        };
      }
      router.refresh();
      return { kind: "ok", text: `task created in ${result.ticker}` };
    }
    case "ask_ai":
      // Open the terminal with a query-string prompt that the AI pane reads.
      router.push(
        `/p/${result.ticker}?ask=${encodeURIComponent(result.ai_prompt ?? "")}`,
      );
      return { kind: "ok", text: `asking ${result.ticker}…` };
  }
}

function useCommandsSafe() {
  // CommandBar is mounted inside the terminal shell, which is inside the
  // CommandPalette provider — but the hook throws if no provider. Guard so
  // CommandBar renders in tests/stories.
  try {
    return useCommands();
  } catch {
    return null;
  }
}

function nowLabel(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
