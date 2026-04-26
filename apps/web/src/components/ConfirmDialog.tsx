"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "./Dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colour the confirm button red. */
  destructive?: boolean;
  /** If set, user must type this exact string to enable confirm. */
  typeToConfirm?: string;
  /** If true, disables the confirm button (e.g. while request in flight). */
  busy?: boolean;
}

/**
 * Confirmation dialog used across admin destructive flows — delete,
 * archive, suspend, transfer ownership. `typeToConfirm` is the extra
 * guardrail for the scariest operations: the user has to type the exact
 * target name/slug/email before the button enables.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  typeToConfirm,
  busy = false,
}: Props) {
  const [typed, setTyped] = useState("");
  const typeOk = !typeToConfirm || typed === typeToConfirm;
  const canConfirm = typeOk && !busy;

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {destructive ? (
          <div className="flex items-start gap-2 rounded-sm border border-danger/40 bg-danger-subtle/50 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span>This action can&apos;t be undone quickly. Read carefully.</span>
          </div>
        ) : null}
        <div className="text-sm text-text-1">{body}</div>
        {typeToConfirm ? (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              Type{" "}
              <code className="rounded-sm border border-border bg-bg-2 px-1 font-mono">
                {typeToConfirm}
              </code>{" "}
              to continue
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </label>
        ) : null}
        <footer className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border bg-bg-2 px-3 py-1.5 text-xs text-text-1 hover:bg-bg-3"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              void onConfirm();
            }}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
              destructive
                ? "border-danger/40 bg-danger-subtle text-danger hover:bg-danger/20"
                : "border-accent bg-accent text-bg-0 hover:bg-accent-hover",
              !canConfirm && "cursor-not-allowed opacity-50",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
