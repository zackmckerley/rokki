"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bold,
  Italic,
  Code,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Eye,
  Edit3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { useUndoStack } from "@/lib/use-undo-stack";
import { announceUndo } from "@/lib/undo-toast";
import {
  applySlashCommand,
  detectSlashCommand,
  dedentLines,
  indentLines,
  insertLink,
  matchSlashCommands,
  togglePrefix,
  wrapSelection,
  type EditState,
  type SlashCommand,
} from "@/lib/markdown-edit";

/**
 * Slightly-richer textarea: a skinny markdown toolbar, keyboard-driven
 * formatting (⌘B / ⌘I / ⌘E / ⌘K, ⌘1-3, ⌘⇧8, ⌘⇧7, Tab in lists),
 * a slash-command popup for block formatting, and a one-tap markdown
 * preview toggle.
 *
 * Built on top of a plain `<textarea>` — no contentEditable, no third-party
 * dep — so the underlying value is always plain markdown that the rest
 * of Rokki already knows how to render via `<Markdown>`.
 *
 * Wraps `useUndoStack` so ⌘Z reverts the last typing burst even though
 * the toolbar mutations look "atomic". The stack is shared with the
 * caller — if you pass `value` / `onChange`, we reset the stack to the
 * incoming value when it changes externally.
 *
 *   ┌───────────────────────────────────────────┐
 *   │  B  I  </>  🔗   H1  H2  H3   •  1.   👁  │
 *   ├───────────────────────────────────────────┤
 *   │  textarea (markdown source)               │
 *   │                                           │
 *   └───────────────────────────────────────────┘
 *
 * `compact` strips the toolbar (shortcuts still fire) — useful for inline
 * edits where the toolbar would feel cramped.
 */
export interface RichTextareaHandle {
  focus: () => void;
  blur: () => void;
  /** Force a snapshot into the undo stack. Useful when the parent saves. */
  commitUndo: () => void;
}

export interface RichTextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Hide the toolbar. Shortcuts still work. */
  compact?: boolean;
  /** Min textarea height in CSS pixels. Default 80. */
  minHeight?: number;
  /** Optional className applied to the outer container. */
  className?: string;
  /** Optional className applied to the textarea itself. */
  textareaClassName?: string;
  /** Context label passed to the undo toast. */
  undoContext?: string;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
  /** Spread extra keydown into the textarea (e.g. ⌘Enter to save). The
   *  RichTextarea calls this AFTER its own handlers, so callers can check
   *  `e.defaultPrevented`. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** ARIA label for the textarea. */
  ariaLabel?: string;
  /** Max length passed through to the textarea. */
  maxLength?: number;
  /** Initial mode — "edit" or "preview". Defaults to "edit". */
  initialMode?: "edit" | "preview";
  /** Optional ref to the underlying textarea — useful when callers need
   *  to read selection / position popups (e.g. @-mention picker). */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export const RichTextarea = forwardRef<RichTextareaHandle, RichTextareaProps>(
  function RichTextarea(props, ref) {
    const {
      value,
      onChange,
      placeholder,
      disabled,
      compact,
      minHeight = 80,
      className,
      textareaClassName,
      undoContext,
      autoFocus,
      onKeyDown,
      ariaLabel,
      maxLength,
      initialMode = "edit",
      textareaRef,
    } = props;

    const internalTaRef = useRef<HTMLTextAreaElement>(null);
    // Mirror the internal ref into the caller's ref so they can read
    // selection / position pop-ups against the live element.
    const setTaRef = useCallback(
      (el: HTMLTextAreaElement | null) => {
        (internalTaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        if (textareaRef) {
          (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        }
      },
      [textareaRef],
    );
    const taRef = internalTaRef;
    const [mode, setMode] = useState<"edit" | "preview">(initialMode);

    // Undo stack — shared with the caller via `value` / `onChange`. When
    // the outer value changes (e.g. parent reset on save), we reset the
    // stack so we don't carry stale history across editing sessions.
    const undo = useUndoStack(value, {
      onUndo: ({ from, to, agoSeconds }) =>
        announceUndo({ from, to, agoSeconds, context: undoContext }),
    });
    const lastExternalRef = useRef(value);
    useEffect(() => {
      if (value !== lastExternalRef.current && value !== undo.value) {
        // Parent rewrote the value (e.g. switched to a different comment).
        // Throw away history and seed afresh.
        lastExternalRef.current = value;
        undo.reset(value);
      } else {
        lastExternalRef.current = value;
      }
      // We intentionally ONLY listen on `value` — undo.reset is stable.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // Keep the parent informed of in-textarea changes.
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    useEffect(() => {
      if (undo.value !== lastExternalRef.current) {
        lastExternalRef.current = undo.value;
        onChangeRef.current(undo.value);
      }
    }, [undo.value]);

    // ----- Slash-command popup ---------------------------------------------
    const [slashState, setSlashState] = useState<{
      slug: string;
      caret: number;
      activeIndex: number;
    } | null>(null);
    const slashOptions = useMemo<SlashCommand[]>(
      () => (slashState ? matchSlashCommands(slashState.slug) : []),
      [slashState],
    );
    const closeSlash = useCallback(() => setSlashState(null), []);

    // ----- Auto-grow -------------------------------------------------------
    // Modern Chromium / Safari support `field-sizing: content` (CSSWG draft).
    // For older browsers we fall back to JS height adjust on input.
    useLayoutEffect(() => {
      const el = taRef.current;
      if (!el) return;
      const supportsFieldSizing =
        typeof CSS !== "undefined" &&
        typeof CSS.supports === "function" &&
        CSS.supports("field-sizing", "content");
      if (supportsFieldSizing) return;
      // Reset height so it can shrink. Then read scrollHeight.
      el.style.height = "auto";
      const next = Math.max(minHeight, el.scrollHeight);
      el.style.height = `${next}px`;
    }, [undo.value, minHeight]);

    // ----- Imperative handle ----------------------------------------------
    useImperativeHandle(ref, () => ({
      focus: () => taRef.current?.focus(),
      blur: () => taRef.current?.blur(),
      commitUndo: () => undo.setValue(undo.value, { commit: true }),
    }));

    useEffect(() => {
      if (autoFocus) taRef.current?.focus();
    }, [autoFocus]);

    // ----- Helpers ---------------------------------------------------------

    const stateFromTextarea = useCallback((): EditState | null => {
      const el = taRef.current;
      if (!el) return null;
      return {
        value: undo.value,
        selectionStart: el.selectionStart ?? undo.value.length,
        selectionEnd: el.selectionEnd ?? undo.value.length,
      };
    }, [undo.value]);

    const applyEdit = useCallback(
      (next: EditState) => {
        // Force a commit so each toolbar action becomes a single undo step
        // — even if the user was mid-typing, we want this discrete edit
        // to be its own snapshot.
        undo.setValue(next.value, { commit: true });
        // Restore selection in the next paint, after React updates the value.
        requestAnimationFrame(() => {
          const el = taRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(next.selectionStart, next.selectionEnd);
        });
      },
      [undo],
    );

    const runFormatter = useCallback(
      (formatter: (s: EditState) => EditState) => {
        const s = stateFromTextarea();
        if (!s) return;
        applyEdit(formatter(s));
      },
      [applyEdit, stateFromTextarea],
    );

    const onBold = useCallback(
      () => runFormatter((s) => wrapSelection(s, "**")),
      [runFormatter],
    );
    const onItalic = useCallback(
      () => runFormatter((s) => wrapSelection(s, "*")),
      [runFormatter],
    );
    const onCode = useCallback(
      () => runFormatter((s) => wrapSelection(s, "`")),
      [runFormatter],
    );
    const onLink = useCallback(() => runFormatter(insertLink), [runFormatter]);
    const onHeading = useCallback(
      (level: 1 | 2 | 3) =>
        runFormatter((s) => togglePrefix(s, "#".repeat(level) + " ")),
      [runFormatter],
    );
    const onBullet = useCallback(
      () => runFormatter((s) => togglePrefix(s, "- ")),
      [runFormatter],
    );
    const onNumbered = useCallback(
      () => runFormatter((s) => togglePrefix(s, "1. ")),
      [runFormatter],
    );

    const onPickSlash = useCallback(
      (cmd: SlashCommand) => {
        const s = stateFromTextarea();
        if (!s) return;
        applyEdit(applySlashCommand(s, cmd));
        closeSlash();
      },
      [applyEdit, stateFromTextarea, closeSlash],
    );

    // ----- Keydown ---------------------------------------------------------

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Slash-command navigation has priority when the popup is open.
        if (slashState && slashOptions.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSlashState((s) =>
              s
                ? { ...s, activeIndex: (s.activeIndex + 1) % slashOptions.length }
                : s,
            );
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSlashState((s) =>
              s
                ? {
                    ...s,
                    activeIndex:
                      (s.activeIndex - 1 + slashOptions.length) %
                      slashOptions.length,
                  }
                : s,
            );
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onPickSlash(slashOptions[slashState.activeIndex]!);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            closeSlash();
            return;
          }
        }

        // Undo handles itself first.
        undo.onKeyDown(e);
        if (e.defaultPrevented) {
          onKeyDown?.(e);
          return;
        }

        const mod = e.metaKey || e.ctrlKey;

        // Tab / Shift+Tab — indent/dedent in lists. Outside lists we still
        // indent so users can use Tab to nest paragraphs in quotes etc.
        if (e.key === "Tab" && !mod) {
          e.preventDefault();
          runFormatter(e.shiftKey ? dedentLines : indentLines);
          onKeyDown?.(e);
          return;
        }

        if (mod) {
          const k = e.key.toLowerCase();
          if (k === "b" && !e.shiftKey) {
            e.preventDefault();
            onBold();
            return;
          }
          if (k === "i" && !e.shiftKey) {
            e.preventDefault();
            onItalic();
            return;
          }
          if (k === "e" && !e.shiftKey) {
            e.preventDefault();
            onCode();
            return;
          }
          if (k === "k" && !e.shiftKey) {
            e.preventDefault();
            onLink();
            return;
          }
          if (!e.shiftKey && (k === "1" || k === "2" || k === "3")) {
            e.preventDefault();
            onHeading(Number(k) as 1 | 2 | 3);
            return;
          }
          // ⌘⇧8 → bullet list (matches the universal bullet shortcut),
          // ⌘⇧7 → numbered list.
          if (e.shiftKey && (k === "8" || e.key === "*")) {
            e.preventDefault();
            onBullet();
            return;
          }
          if (e.shiftKey && (k === "7" || e.key === "&")) {
            e.preventDefault();
            onNumbered();
            return;
          }
        }
        onKeyDown?.(e);
      },
      [
        slashState,
        slashOptions,
        undo,
        onBold,
        onItalic,
        onCode,
        onLink,
        onHeading,
        onBullet,
        onNumbered,
        onPickSlash,
        closeSlash,
        runFormatter,
        onKeyDown,
      ],
    );

    // ----- Change ---------------------------------------------------------

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const next = e.target.value;
        const caret = e.target.selectionStart ?? next.length;
        undo.setValue(next);
        // Update slash-popup state based on the new caret position.
        const detected = detectSlashCommand(next, caret);
        if (detected) {
          setSlashState((prev) =>
            prev && prev.slug === detected.slug
              ? { ...prev, caret }
              : { slug: detected.slug, caret, activeIndex: 0 },
          );
        } else if (slashState) {
          closeSlash();
        }
      },
      [undo, slashState, closeSlash],
    );

    // ----- Render ----------------------------------------------------------

    const previewing = mode === "preview";

    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {!compact ? (
          <Toolbar
            disabled={disabled || previewing}
            previewing={previewing}
            onBold={onBold}
            onItalic={onItalic}
            onCode={onCode}
            onLink={onLink}
            onH1={() => onHeading(1)}
            onH2={() => onHeading(2)}
            onH3={() => onHeading(3)}
            onBullet={onBullet}
            onNumbered={onNumbered}
            onTogglePreview={() => setMode((m) => (m === "edit" ? "preview" : "edit"))}
          />
        ) : null}

        {previewing ? (
          <div
            data-testid="rich-textarea-preview"
            className="rounded-sm border border-border bg-bg-0 p-3"
            style={{ minHeight }}
          >
            {undo.value.trim() ? (
              <Markdown source={undo.value} />
            ) : (
              <p className="text-xs text-text-3">Nothing to preview yet.</p>
            )}
          </div>
        ) : (
          <div className="relative">
            <textarea
              ref={setTaRef}
              value={undo.value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onBlur={closeSlash}
              placeholder={placeholder}
              disabled={disabled}
              maxLength={maxLength}
              aria-label={ariaLabel}
              spellCheck
              style={{
                minHeight,
                // CSS-side auto-grow when supported.
                fieldSizing: "content",
              } as React.CSSProperties}
              className={cn(
                "w-full resize-y rounded-sm border border-border bg-bg-0 p-2 text-sm text-text-0 outline-none focus:border-border-focus",
                disabled && "cursor-not-allowed opacity-60",
                textareaClassName,
              )}
            />
            {slashState && slashOptions.length > 0 ? (
              <SlashPopup
                options={slashOptions}
                activeIndex={slashState.activeIndex}
                onPick={onPickSlash}
                onMouseEnter={(i) =>
                  setSlashState((s) => (s ? { ...s, activeIndex: i } : s))
                }
              />
            ) : null}
          </div>
        )}
      </div>
    );
  },
);

/* ------------------------------------------------------------------------ */
/* Toolbar                                                                    */
/* ------------------------------------------------------------------------ */

function Toolbar({
  disabled,
  previewing,
  onBold,
  onItalic,
  onCode,
  onLink,
  onH1,
  onH2,
  onH3,
  onBullet,
  onNumbered,
  onTogglePreview,
}: {
  disabled?: boolean;
  previewing: boolean;
  onBold: () => void;
  onItalic: () => void;
  onCode: () => void;
  onLink: () => void;
  onH1: () => void;
  onH2: () => void;
  onH3: () => void;
  onBullet: () => void;
  onNumbered: () => void;
  onTogglePreview: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Markdown formatting"
      className="flex items-center gap-0.5 rounded-sm border border-border bg-bg-1 px-1 py-0.5 text-text-2"
    >
      <ToolBtn label="Bold (⌘B)" onClick={onBold} disabled={disabled}>
        <Bold className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn label="Italic (⌘I)" onClick={onItalic} disabled={disabled}>
        <Italic className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn label="Code (⌘E)" onClick={onCode} disabled={disabled}>
        <Code className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn label="Link (⌘K)" onClick={onLink} disabled={disabled}>
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolBtn>
      <Sep />
      <ToolBtn label="Heading 1 (⌘1)" onClick={onH1} disabled={disabled}>
        <Heading1 className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn label="Heading 2 (⌘2)" onClick={onH2} disabled={disabled}>
        <Heading2 className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn label="Heading 3 (⌘3)" onClick={onH3} disabled={disabled}>
        <Heading3 className="h-3.5 w-3.5" />
      </ToolBtn>
      <Sep />
      <ToolBtn label="Bullet list (⌘⇧8)" onClick={onBullet} disabled={disabled}>
        <List className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        label="Numbered list (⌘⇧7)"
        onClick={onNumbered}
        disabled={disabled}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolBtn>
      <div className="ml-auto" />
      <ToolBtn
        label={previewing ? "Edit" : "Preview"}
        onClick={onTogglePreview}
        active={previewing}
      >
        {previewing ? (
          <Edit3 className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // Keep focus inside the textarea when toolbar buttons are clicked,
      // so the selection isn't lost between click and the formatter run.
      onMouseDown={(e) => e.preventDefault()}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-sm hover:bg-bg-2 hover:text-text-0",
        active && "bg-bg-3 text-text-0",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />;
}

/* ------------------------------------------------------------------------ */
/* SlashPopup                                                                 */
/* ------------------------------------------------------------------------ */

function SlashPopup({
  options,
  activeIndex,
  onPick,
  onMouseEnter,
}: {
  options: SlashCommand[];
  activeIndex: number;
  onPick: (cmd: SlashCommand) => void;
  onMouseEnter: (index: number) => void;
}) {
  return (
    <ul
      role="listbox"
      aria-label="Slash commands"
      className="absolute left-2 top-full z-10 mt-1 w-56 overflow-hidden rounded-sm border border-border bg-bg-2 text-xs shadow-lg"
    >
      {options.map((cmd, i) => (
        <li key={cmd.id} role="option" aria-selected={i === activeIndex}>
          <button
            type="button"
            // mousedown → onPick so we don't lose focus first.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(cmd);
            }}
            onMouseEnter={() => onMouseEnter(i)}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-text-1",
              i === activeIndex ? "bg-bg-3 text-text-0" : "hover:bg-bg-3",
            )}
          >
            <span>{cmd.label}</span>
            <span className="font-mono text-[10px] text-text-3">
              /{cmd.id}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
