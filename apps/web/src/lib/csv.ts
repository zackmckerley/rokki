/**
 * Tiny CSV writer — no external dep. Quotes any field containing a
 * comma, double-quote, or newline; doubles up internal double-quotes
 * per RFC 4180.
 */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): string {
  const lines: string[] = [];
  lines.push(headers.map(escape).join(","));
  for (const row of rows) {
    lines.push(row.map((c) => escape(stringify(c))).join(","));
  }
  return lines.join("\r\n");
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function escape(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
