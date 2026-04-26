/**
 * Pure helpers for the RichTextarea — string-in, string-out so they're
 * dirt-cheap to unit test. The component layer wires these to the DOM
 * (selection, cursor restore, keydown).
 *
 * Every function takes the current textarea state as plain inputs:
 *
 *   • `value`         — full text in the textarea
 *   • `selectionStart` / `selectionEnd` — current selection
 *
 * and returns:
 *
 *   {
 *     value: string,           // new text
 *     selectionStart: number,  // where to place the caret/anchor
 *     selectionEnd: number,    // where to place the focus
 *   }
 *
 * That shape lets the component drive selection restore through one
 * code path regardless of which formatter ran.
 */

export interface EditState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Wrap the current selection in `marker` on both sides. If the selection
 * is empty, insert the markers and place the caret between them.
 *
 *   wrapSelection({...}, "**")
 *
 * If the selection is already wrapped (immediate neighbors are the marker),
 * we *unwrap* — that's the toggle behavior every editor expects.
 */
export function wrapSelection(state: EditState, marker: string): EditState {
  const { value, selectionStart, selectionEnd } = state;
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const before = value.slice(0, start);
  const middle = value.slice(start, end);
  const after = value.slice(end);

  // Toggle off when the selection is exactly the marker run.
  if (
    middle.length > 0 &&
    middle.startsWith(marker) &&
    middle.endsWith(marker) &&
    middle.length >= marker.length * 2
  ) {
    const stripped = middle.slice(marker.length, middle.length - marker.length);
    return {
      value: before + stripped + after,
      selectionStart: start,
      selectionEnd: start + stripped.length,
    };
  }

  // Toggle off when the markers sit just outside the selection.
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      value:
        before.slice(0, before.length - marker.length) +
        middle +
        after.slice(marker.length),
      selectionStart: start - marker.length,
      selectionEnd: end - marker.length,
    };
  }

  const wrapped = marker + middle + marker;
  return {
    value: before + wrapped + after,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + middle.length,
  };
}

/**
 * Insert a markdown link.
 *   - If selection is non-empty: produce `[selection](|)` with caret in the
 *     URL slot.
 *   - If selection is empty: produce `[|](url)` with caret at the label slot
 *     so the user can type the link text first.
 */
export function insertLink(state: EditState): EditState {
  const { value, selectionStart, selectionEnd } = state;
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const before = value.slice(0, start);
  const middle = value.slice(start, end);
  const after = value.slice(end);
  if (middle.length > 0) {
    const inserted = `[${middle}](`;
    const closing = `)`;
    const caret = before.length + inserted.length;
    return {
      value: before + inserted + closing + after,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }
  const labelOpen = "[";
  const labelClose = "](url)";
  const caret = before.length + labelOpen.length;
  return {
    value: before + labelOpen + labelClose + after,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/**
 * Toggle a line-prefix on the current line (or each selected line).
 * Used for `# `, `## `, `### `, `- `, `1. `, `> `, etc.
 *
 * If every selected line already starts with `prefix`, we remove it.
 * If they're a mix or none have it, we add it everywhere.
 *
 * For `1. `-style numbered lists we don't try to renumber — that's beyond
 * scope and would surprise users who paste arbitrary text.
 */
export function togglePrefix(state: EditState, prefix: string): EditState {
  const { value, selectionStart, selectionEnd } = state;
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const lineStart = lineStartOf(value, start);
  const lineEnd = lineEndOf(value, end);
  const before = value.slice(0, lineStart);
  const block = value.slice(lineStart, lineEnd);
  const after = value.slice(lineEnd);
  const lines = block.split("\n");

  // For headings, "already have" means the line starts with the EXACT
  // heading prefix we're toggling — that way ⌘1 toggles H1 off, but ⌘1
  // on an H2 line upgrades to H1 instead of just stripping the heading.
  const heading = headingPrefixOf(prefix);
  const allHave = lines.every((l) => {
    if (!l.trim()) return true;
    return l.startsWith(prefix);
  });

  let next: string;
  if (allHave && lines.some((l) => l.trim().length > 0)) {
    // Toggle off — strip exactly this prefix.
    next = lines
      .map((l) => {
        if (!l.trim()) return l;
        return l.startsWith(prefix) ? l.slice(prefix.length) : l;
      })
      .join("\n");
  } else {
    // Toggle on. For headings, replace any existing heading-level prefix
    // so users can switch levels with ⌘1 / ⌘2 / ⌘3 in place.
    next = lines
      .map((l) => {
        if (heading) {
          const stripped = l.replace(/^#{1,6}\s/, "");
          return prefix + stripped;
        }
        return l.startsWith(prefix) ? l : prefix + l;
      })
      .join("\n");
  }

  const delta = next.length - block.length;
  return {
    value: before + next + after,
    selectionStart: start === lineStart ? lineStart : Math.max(lineStart, start + signedAdjust(prefix, allHave)),
    selectionEnd: end + delta,
  };
}

function signedAdjust(prefix: string, removing: boolean): number {
  // Approximation: for a single-line edit, the caret on the original line
  // shifts by the prefix length. That's good enough for the typical
  // "press ⌘1 with cursor mid-word" case; multi-line selections fall back
  // to using `lineStart` as the new start.
  return removing ? -prefix.length : prefix.length;
}

function headingPrefixOf(prefix: string): boolean {
  return /^#{1,6}\s$/.test(prefix);
}

/**
 * Indent (prepend two spaces to) the current line(s). Used by the Tab
 * handler when inside a list item.
 *
 * If you're inside a `- ` or `1. ` list, indenting nests it. If you're not
 * in a list, we still indent — feels right for "I want to indent this
 * paragraph" too.
 */
export function indentLines(state: EditState): EditState {
  return shiftLines(state, +1);
}

export function dedentLines(state: EditState): EditState {
  return shiftLines(state, -1);
}

const INDENT = "  "; // two spaces

function shiftLines(state: EditState, dir: 1 | -1): EditState {
  const { value, selectionStart, selectionEnd } = state;
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const lineStart = lineStartOf(value, start);
  const lineEnd = lineEndOf(value, end);
  const before = value.slice(0, lineStart);
  const block = value.slice(lineStart, lineEnd);
  const after = value.slice(lineEnd);
  const lines = block.split("\n");
  const next = lines
    .map((l) => {
      if (dir === 1) return INDENT + l;
      if (l.startsWith(INDENT)) return l.slice(INDENT.length);
      if (l.startsWith("\t")) return l.slice(1);
      return l;
    })
    .join("\n");
  const delta = next.length - block.length;
  // For single-line, shift caret by indent length so the visual cursor
  // doesn't jump.
  if (lines.length === 1) {
    const shift = dir === 1 ? INDENT.length : -Math.min(INDENT.length, block.length);
    return {
      value: before + next + after,
      selectionStart: Math.max(lineStart, start + shift),
      selectionEnd: Math.max(lineStart, end + shift),
    };
  }
  return {
    value: before + next + after,
    selectionStart: lineStart,
    selectionEnd: end + delta,
  };
}

/**
 * Detect whether the caret is at the start of a line that begins with
 * a slash, returning the typed slug. This is the trigger for the
 * slash-command popup.
 *
 *   "...|"  → null
 *   "/he|"  with that being the only thing on the line → "he"
 *   "  /h"  with cursor at end → "h" (leading whitespace is OK)
 *   "x /h"  → null (not at line start)
 */
export function detectSlashCommand(
  value: string,
  caret: number,
): { slug: string; lineStart: number; slashIndex: number } | null {
  const lineStart = lineStartOf(value, caret);
  const lineUpToCaret = value.slice(lineStart, caret);
  const m = /^\s*\/([a-zA-Z]*)$/.exec(lineUpToCaret);
  if (!m) return null;
  const slashIndex = lineStart + (lineUpToCaret.length - m[1].length - 1);
  return { slug: m[1], lineStart, slashIndex };
}

/**
 * Replace the slash + slug with the result of applying `transform` to the
 * line, used after the user picks a slash-command option.
 */
export function applySlashCommand(
  state: EditState,
  command: SlashCommand,
): EditState {
  const detected = detectSlashCommand(state.value, state.selectionStart);
  if (!detected) return state;
  // Strip the slash + slug from the line, then apply the prefix.
  const before = state.value.slice(0, detected.slashIndex);
  const after = state.value.slice(state.selectionEnd);
  const cleaned: EditState = {
    value: before + after,
    selectionStart: detected.slashIndex,
    selectionEnd: detected.slashIndex,
  };
  return togglePrefix(cleaned, command.prefix);
}

export interface SlashCommand {
  /** Identifier used by the slug match (case-insensitive). */
  id: string;
  /** Human label in the popup. */
  label: string;
  /** The prefix to apply to the current line via `togglePrefix`. */
  prefix: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "heading", label: "Heading 1", prefix: "# " },
  { id: "h2", label: "Heading 2", prefix: "## " },
  { id: "h3", label: "Heading 3", prefix: "### " },
  { id: "bullet", label: "Bullet list", prefix: "- " },
  { id: "numbered", label: "Numbered list", prefix: "1. " },
  { id: "quote", label: "Quote", prefix: "> " },
  { id: "code", label: "Code block", prefix: "    " },
];

/**
 * Filter the commands by a prefix slug typed after `/`. Uses simple
 * case-insensitive prefix matching — same UX as the command palette.
 */
export function matchSlashCommands(slug: string): SlashCommand[] {
  if (!slug) return SLASH_COMMANDS;
  const needle = slug.toLowerCase();
  return SLASH_COMMANDS.filter(
    (c) => c.id.startsWith(needle) || c.label.toLowerCase().startsWith(needle),
  );
}

function lineStartOf(value: string, index: number): number {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (value[i] === "\n") return i + 1;
  }
  return 0;
}

function lineEndOf(value: string, index: number): number {
  for (let i = index; i < value.length; i += 1) {
    if (value[i] === "\n") return i;
  }
  return value.length;
}
