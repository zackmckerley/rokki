/**
 * Rokki command-bar syntax — the typed DSL at the bottom of every terminal
 * screen. Modelled on Bloomberg's "[TICKER] [VERB] [args]" pattern.
 *
 * Recognised forms:
 *
 *   GO HOME                               → navigate to dashboard
 *   GO TOOLS                              → navigate to /tools
 *   GO SETTINGS                           → navigate to /settings
 *   GO HELP                               → navigate to /help
 *
 *   <TICKER> GO                           → /p/<TICKER>
 *   <TICKER> F<2–12>                      → /p/<TICKER> with that F-key pane
 *   <TICKER> TASK "<title>"               → create task in that terminal
 *   <TICKER> ASK "<question>"             → open AI chat prefilled with question
 *
 *   TOOL <slug>                           → open /tools/<slug>
 *   /<query>                              → open command palette with query
 *
 * Everything is case-insensitive. Quoted args are joined with spaces.
 */

export interface Parsed {
  kind: "navigate" | "open_palette" | "create_task" | "ask_ai" | "noop" | "error";
  path?: string;
  palette_query?: string;
  ticker?: string;
  task_title?: string;
  ai_prompt?: string;
  message?: string;
}

const TICKER = /^[A-Z][A-Z0-9]{1,9}$/;
const FKEY = /^F([2-9]|1[0-2])$/;

/**
 * Best-effort tokenizer: splits on whitespace, preserves double-quoted
 * runs as a single token (with quotes stripped).
 */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i]!)) i++;
    if (i >= input.length) break;
    if (input[i] === '"') {
      const end = input.indexOf('"', i + 1);
      if (end < 0) {
        out.push(input.slice(i + 1));
        break;
      }
      out.push(input.slice(i + 1, end));
      i = end + 1;
    } else {
      const start = i;
      while (i < input.length && !/\s/.test(input[i]!)) i++;
      out.push(input.slice(start, i));
    }
  }
  return out;
}

export function parseCommand(raw: string): Parsed {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "noop" };

  // Leading `/` opens the palette with the rest as query.
  if (trimmed.startsWith("/")) {
    return {
      kind: "open_palette",
      palette_query: trimmed.slice(1).trim(),
    };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return { kind: "noop" };
  const upper = tokens[0]!.toUpperCase();

  // GO <destination>
  if (upper === "GO") {
    const dest = (tokens[1] ?? "").toUpperCase();
    const path = GO_DESTS[dest];
    if (!path) {
      return {
        kind: "error",
        message: `Unknown destination. Try: ${Object.keys(GO_DESTS).join(", ")}`,
      };
    }
    return { kind: "navigate", path };
  }

  // TOOL <slug>
  if (upper === "TOOL") {
    const slug = tokens[1];
    if (!slug) return { kind: "error", message: "Usage: TOOL <slug>" };
    return { kind: "navigate", path: `/tools/${slug}` };
  }

  // <TICKER> <verb> [...]
  if (TICKER.test(upper)) {
    const ticker = upper;
    const verb = (tokens[1] ?? "").toUpperCase();

    if (!verb || verb === "GO") {
      return { kind: "navigate", ticker, path: `/p/${ticker}` };
    }
    if (FKEY.test(verb)) {
      return {
        kind: "navigate",
        ticker,
        path: `/p/${ticker}?pane=${verb}`,
      };
    }
    if (verb === "TASK") {
      const title = tokens.slice(2).join(" ").trim();
      if (!title)
        return {
          kind: "error",
          message: `Usage: ${ticker} TASK "<title>"`,
        };
      return { kind: "create_task", ticker, task_title: title };
    }
    if (verb === "ASK") {
      const prompt = tokens.slice(2).join(" ").trim();
      if (!prompt)
        return { kind: "error", message: `Usage: ${ticker} ASK "<question>"` };
      return { kind: "ask_ai", ticker, ai_prompt: prompt };
    }
    return {
      kind: "error",
      message: `Unknown verb for ${ticker}. Try: GO, F3, TASK, ASK`,
    };
  }

  return {
    kind: "error",
    message: "Unrecognized command. Try GO HOME, <TICKER> F3, TOOL <slug>, or /<search>.",
  };
}

const GO_DESTS: Record<string, string> = {
  HOME: "/",
  DASHBOARD: "/",
  TOOLS: "/tools",
  SETTINGS: "/settings",
  HELP: "/help",
  ADMIN: "/admin",
  WELCOME: "/welcome",
};
