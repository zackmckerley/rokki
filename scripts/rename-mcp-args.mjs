#!/usr/bin/env node
/**
 * Second-pass rename focused on MCP tool names + args inside
 * apps/mcp-server/src/tools.ts only.
 *
 * Strategy: do rokki_create_space / update_space specially (it's the only
 * tool where `org` param → `space` and the tool name also flips), then
 * rename the generic pattern `args.space` → `args.terminal` everywhere
 * else, plus tool names and input-schema keys.
 */

import { readFile, writeFile } from "node:fs/promises";

const path = "apps/mcp-server/src/tools.ts";
let body = await readFile(path, "utf8");
const original = body;

// 1. Tool names that really refer to terminals
const TOOL_RENAMES = [
  ['"rokki_list_spaces"', '"rokki_list_terminals"'],
  ['"rokki_create_space"', '"rokki_create_terminal"'],
  ['"rokki_update_space"', '"rokki_update_terminal"'],
];
for (const [a, b] of TOOL_RENAMES) body = body.split(a).join(b);

// 2. In rokki_create_terminal specifically — formerly the only tool that
//    treated `args.org` as the parent space — rename `args.org` → `args.space`
//    and rename the inputSchema key `org:` → `space:` inside that block.
const createStart = body.indexOf('"rokki_create_terminal"');
if (createStart !== -1) {
  // Find the next top-level "},\n  {" that ends this tool definition.
  const afterStart = body.slice(createStart);
  const end = afterStart.indexOf("\n  {");
  const block = end === -1 ? afterStart : afterStart.slice(0, end);
  const newBlock = block
    .replaceAll("args.org", "args.space")
    .replace(
      /org: \{\s*\n\s*type: "string",\s*\n\s*description:\s*"Organization id OR exact [^"]+"/,
      'space: { type: "string", description: "Parent space id OR exact name"',
    );
  body = body.slice(0, createStart) + newBlock + body.slice(createStart + block.length);
}

// 3. Everywhere else: args.space → args.terminal. Only in tools.ts this is
//    a scope-arg for terminal-scoped tools. The create_terminal block above
//    already uses args.space to refer to the parent space, so we need to
//    preserve those references. Use a narrow guard by temporarily tagging
//    the create_terminal block.
const TAG = "__CREATE_TERMINAL_PARENT_SPACE_ARG__";
if (createStart !== -1) {
  const afterStart2 = body.indexOf('"rokki_create_terminal"');
  const blockEnd = body.indexOf("\n  {", afterStart2);
  const createBlock = blockEnd === -1 ? body.slice(afterStart2) : body.slice(afterStart2, blockEnd);
  const taggedBlock = createBlock.replaceAll("args.space", `args.${TAG}`);
  body = blockEnd === -1
    ? body.slice(0, afterStart2) + taggedBlock
    : body.slice(0, afterStart2) + taggedBlock + body.slice(blockEnd);
}

// Swap all remaining args.space → args.terminal globally.
body = body.replaceAll("args.space", "args.terminal");
// Un-tag.
body = body.replaceAll(`args.${TAG}`, "args.space");

// 4. Rename inputSchema arg key `space:` → `terminal:` inside every other
//    tool. We target the specific pattern:
//       space: {
//         type: "string",
//    inside a `properties: { … }` block. The create_terminal tool uses
//    `space:` as the parent arg — we already rewrote its block above so
//    its placeholder is literally `space:` with description "Parent space".
body = body.replaceAll(
  /(\s+)space: \{\n(\s+)type: "string",\n(\s+)description: "(Ticker \([^"]+\) or exact name of the space\.)"/g,
  (_m, i1, i2, i3, _desc) =>
    `${i1}terminal: {\n${i2}type: "string",\n${i3}description: "Ticker (e.g. BRKL) or exact name of the terminal."`,
);
body = body.replaceAll(
  /(\s+)space: \{ type: "string" \}/g,
  (_m, i) => `${i}terminal: { type: "string" }`,
);
body = body.replaceAll(
  /(\s+)space: \{ type: "string", description: "(Space ticker or name\.)"\s*\}/g,
  (_m, i, _d) =>
    `${i}terminal: { type: "string", description: "Terminal ticker or name." }`,
);

// 5. required arrays: ["space" → ["terminal" where followed by a comma or ]
body = body.replaceAll(
  /required: \["space"(\]|,)/g,
  (_m, tail) => `required: ["terminal"${tail}`,
);
body = body.replaceAll(
  /required: \["space",/g,
  () => `required: ["terminal",`,
);

// 6. `spaceArg` variable → `terminalArg`
body = body.replaceAll("spaceArg", "terminalArg");

// 7. args.space → args.terminal in the rokki_search / rokki_recent_activity
//    tools where `space` is an OPTIONAL scope. Already covered above.
//    The only `args.space` references that remain should be inside
//    rokki_create_terminal (parent space id).

// 8. Text in descriptions — "the space" → "the terminal" in tool descriptions.
//    (Leave generic mentions of "spaces" alone since some still refer to
//    spaces-as-orgs after this cut.)
body = body.replaceAll(
  "List tasks in a specific space.",
  "List tasks in a specific terminal.",
);
body = body.replaceAll("Create a new task in a space.", "Create a new task in a terminal.");

await writeFile(path, body);
console.log(
  `rewrote ${path}, ${Math.round((body.length - original.length) / 1024)} KB delta`,
);
