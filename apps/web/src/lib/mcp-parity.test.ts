/**
 * Guards the MCP ↔ REST parity matrix against silent drift.
 *
 * The matrix (`mcp-parity.ts`) is the source of truth for the "every UI
 * feature is available via API and MCP" non-negotiable. These tests keep it
 * honest by cross-checking it against the OpenAPI spec and the set of shipped
 * markets MCP tools — both self-contained in the web package, so no
 * cross-package import of the MCP server is needed.
 *
 * Matrix conventions (matched here): an endpoint is "<METHODS> <path>" where
 * METHODS may be slash-combined (e.g. "GET/POST") and the path uses
 * Express-style params (":id"). OpenAPI uses "{id}", so we normalize.
 */
import { describe, it, expect } from "vitest";
import { PARITY_ROWS } from "./mcp-parity";
import { openApiDocument } from "./openapi";

/** The rokki_markets_* tools actually registered in apps/mcp-server. */
const SHIPPED_MARKETS_TOOLS = [
  "rokki_markets_quote",
  "rokki_markets_search",
  "rokki_markets_watchlists",
  "rokki_markets_watchlist_add",
  "rokki_markets_watchlist_remove",
  "rokki_markets_portfolio_add_lot",
  "rokki_markets_portfolio_performance",
  "rokki_markets_alerts",
  "rokki_markets_alert_create",
] as const;

const HTTP_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

/** Express ":param" → OpenAPI "{param}". */
const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

/** Split "GET/POST /v1/x/:id" into [{method,path}, …], one per method. */
function expandEndpoint(entry: string): { method: string; path: string }[] {
  const [methods = "", path = ""] = entry.split(" ");
  return methods.split("/").map((method) => ({ method, path }));
}

const paths = openApiDocument.paths as Record<string, Record<string, unknown>>;
const marketsRows = PARITY_ROWS.filter((r) => r.resource === "markets");

describe("MCP ↔ REST parity matrix", () => {
  it("every apiEndpoints entry is a well-formed '<METHOD[/METHOD…]> /path'", () => {
    for (const row of PARITY_ROWS) {
      for (const entry of row.apiEndpoints) {
        for (const { method, path } of expandEndpoint(entry)) {
          expect(HTTP_METHODS.has(method), `bad method in "${entry}"`).toBe(true);
          expect(path.startsWith("/"), `bad path in "${entry}"`).toBe(true);
        }
      }
    }
  });

  it("a 'missing' row never names an MCP tool", () => {
    for (const row of PARITY_ROWS) {
      if (row.status === "missing") {
        expect(row.mcpTool, `${row.resource}/${row.action} is 'missing' yet names a tool`).toBeNull();
      }
    }
  });

  it("no duplicate (resource, action) pairs", () => {
    const seen = new Set<string>();
    for (const row of PARITY_ROWS) {
      const key = `${row.resource}::${row.action}`;
      expect(seen.has(key), `duplicate parity row: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("has rows for the markets resource", () => {
    expect(marketsRows.length).toBeGreaterThan(0);
  });

  it("every markets REST endpoint in the matrix is documented in OpenAPI", () => {
    for (const row of marketsRows) {
      for (const entry of row.apiEndpoints) {
        for (const { method, path } of expandEndpoint(entry)) {
          // Internal cron jobs are intentionally absent from the public spec.
          if (path.startsWith("/v1/cron/")) continue;
          const apiPath = toOpenApiPath(path);
          const ops = paths[apiPath];
          expect(ops, `OpenAPI is missing path ${apiPath} (referenced by parity matrix)`).toBeTruthy();
          expect(
            ops?.[method.toLowerCase()],
            `OpenAPI path ${apiPath} is missing the ${method} operation`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("every documented markets OpenAPI operation appears in the parity matrix", () => {
    const matrixOps = new Set(
      marketsRows.flatMap((r) =>
        r.apiEndpoints.flatMap((e) =>
          expandEndpoint(e).map(({ method, path }) => `${method} ${toOpenApiPath(path)}`),
        ),
      ),
    );
    for (const [path, ops] of Object.entries(paths)) {
      if (!path.startsWith("/v1/markets/")) continue;
      for (const method of Object.keys(ops)) {
        if (!HTTP_METHODS.has(method.toUpperCase())) continue;
        const key = `${method.toUpperCase()} ${path}`;
        expect(matrixOps.has(key), `parity matrix is missing ${key}`).toBe(true);
      }
    }
  });

  it("all 9 shipped markets MCP tools are marked present in the matrix", () => {
    const presentTools = new Set(
      marketsRows.filter((r) => r.status === "present").map((r) => r.mcpTool),
    );
    for (const tool of SHIPPED_MARKETS_TOOLS) {
      expect(presentTools.has(tool), `shipped tool ${tool} is not 'present' in the matrix`).toBe(true);
    }
  });

  it("every 'present' markets row names a shipped tool", () => {
    const shipped = new Set<string>(SHIPPED_MARKETS_TOOLS);
    for (const row of marketsRows) {
      if (row.status === "present") {
        expect(
          row.mcpTool !== null && shipped.has(row.mcpTool),
          `markets row "${row.action}" is present but names unknown tool ${row.mcpTool}`,
        ).toBe(true);
      }
    }
  });
});
