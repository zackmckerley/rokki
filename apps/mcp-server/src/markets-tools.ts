/**
 * Markets MCP tools — API + MCP parity for the markets module.
 *
 * Lets an LLM client drive the markets terminal: look up quotes, manage
 * personal watchlists, record portfolio lots, check performance, and set
 * alerts. Market-data reads hit Finnhub directly (same free feed as the web
 * app). DB writes are scoped to USER-owned rows (user_id = session.userId) so
 * the service-role client never mutates another tenant's data
 * (rokki/CLAUDE.md: per-user scoping, no service-key shortcuts).
 *
 * The generated DB types don't yet include the `mkt_*` tables (regenerated via
 * `supabase gen types` post-migration); following the repo convention for the
 * Supabase client boundary, DB access here is loosely typed and query RESULTS
 * are cast to the Row interfaces below.
 *
 * Registered by spreading `marketsTools` into the TOOLS array in tools.ts.
 */
import { admin, type AuthedSession } from "./auth.js";
import type { ToolDefinition } from "./tools.js";

// ── result helper (textResult is private to tools.ts) ──────────────────────

function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

// ── row shapes for the mkt_* tables this module touches ────────────────────

interface WatchlistRow {
  id: string;
  user_id: string | null;
  name: string;
}
interface WatchlistSymbolRow {
  watchlist_id: string;
  symbol: string;
}
interface PortfolioRow {
  id: string;
  user_id: string | null;
  name: string;
  base_currency: string;
}
interface LotRow {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  trade_date: string;
}
interface AlertRow {
  symbol: string;
  condition: string;
  threshold: number;
  active: boolean;
}

// Loosely-typed client boundary (generated types lack mkt_*; see file header).
type MktClient = any;

/** Loosely-typed client for the mkt_* tables (see file header). */
const mdb = (): MktClient => admin;

// ── Finnhub (free) market-data reads ───────────────────────────────────────

interface FinnhubQuoteRaw {
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
}

async function finnhubQuote(symbol: string): Promise<FinnhubQuoteRaw | null> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;
  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`,
  );
  if (!res.ok) return null;
  const q = (await res.json()) as FinnhubQuoteRaw;
  return q && typeof q.c === "number" && q.c !== 0 ? q : null;
}

async function finnhubSearch(
  query: string,
): Promise<{ symbol: string; description: string }[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];
  const res = await fetch(
    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${token}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    result?: { symbol: string; description: string }[];
  };
  return (data.result ?? []).slice(0, 15);
}

const sym = (v: unknown) => String(v ?? "").trim().toUpperCase();

// ── tools ──────────────────────────────────────────────────────────────────

export const marketsTools: ToolDefinition[] = [
  {
    name: "rokki_markets_quote",
    description:
      "Get a real-time stock/ETF quote (price, change, day range) for a symbol, e.g. AAPL or VNQ.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol, e.g. AAPL." },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const symbol = sym(args.symbol);
      if (!symbol) return textResult("symbol is required.", true);
      const q = await finnhubQuote(symbol);
      if (!q)
        return textResult(
          `No quote for ${symbol} (or FINNHUB_API_KEY not configured).`,
          true,
        );
      const sign = (q.d ?? 0) >= 0 ? "+" : "";
      return textResult(
        `${symbol}: $${q.c.toFixed(2)} (${sign}${(q.d ?? 0).toFixed(2)}, ${sign}${(q.dp ?? 0).toFixed(2)}%). ` +
          `Open ${q.o.toFixed(2)} · High ${q.h.toFixed(2)} · Low ${q.l.toFixed(2)} · Prev ${q.pc.toFixed(2)}.`,
      );
    },
  },

  {
    name: "rokki_markets_search",
    description: "Search for stock symbols by company name or ticker.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Company name or partial symbol." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const query = String(args.query ?? "").trim();
      if (!query) return textResult("query is required.", true);
      const matches = await finnhubSearch(query);
      if (matches.length === 0) return textResult(`No matches for "${query}".`);
      return textResult(
        matches.map((m) => `• ${m.symbol} — ${m.description}`).join("\n"),
      );
    },
  },

  {
    name: "rokki_markets_watchlists",
    description: "List your personal markets watchlists and their symbols.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, session: AuthedSession) => {
      const db = mdb();
      const { data: listData } = await db
        .from("mkt_watchlists")
        .select("id, name, user_id")
        .eq("user_id", session.userId);
      const lists = (listData ?? []) as WatchlistRow[];
      if (lists.length === 0) return textResult("You have no watchlists yet.");
      const { data: symData } = await db
        .from("mkt_watchlist_symbols")
        .select("watchlist_id, symbol")
        .in(
          "watchlist_id",
          lists.map((l) => l.id),
        );
      const syms = (symData ?? []) as WatchlistSymbolRow[];
      const lines = lists.map((l) => {
        const s = syms.filter((x) => x.watchlist_id === l.id).map((x) => x.symbol);
        return `• ${l.name}: ${s.length ? s.join(", ") : "(empty)"}`;
      });
      return textResult(lines.join("\n"));
    },
  },

  {
    name: "rokki_markets_watchlist_add",
    description:
      "Add a symbol to one of your personal watchlists (creates the watchlist if it doesn't exist). Requires write scope.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        watchlist: { type: "string", description: "Watchlist name." },
        symbol: { type: "string", description: "Stock symbol to add." },
      },
      required: ["watchlist", "symbol"],
      additionalProperties: false,
    },
    handler: async (args, session: AuthedSession) => {
      const name = String(args.watchlist ?? "").trim();
      const symbol = sym(args.symbol);
      if (!name || !symbol)
        return textResult("watchlist and symbol are required.", true);
      const db = mdb();
      const existing = await db
        .from("mkt_watchlists")
        .select("id, name, user_id")
        .eq("user_id", session.userId)
        .eq("name", name)
        .maybeSingle();
      let wl = existing.data as WatchlistRow | null;
      if (!wl) {
        const created = await db
          .from("mkt_watchlists")
          .insert({ user_id: session.userId, name, created_by: session.userId })
          .select("id, name, user_id")
          .single();
        if (created.error || !created.data)
          return textResult(
            `Could not create watchlist: ${created.error?.message ?? "unknown"}`,
            true,
          );
        wl = created.data as WatchlistRow;
      }
      const { error } = await db
        .from("mkt_watchlist_symbols")
        .insert({ watchlist_id: wl.id, symbol, note: null });
      if (error && error.code !== "23505")
        return textResult(`Could not add symbol: ${error.message}`, true);
      return textResult(`Added ${symbol} to "${name}".`);
    },
  },

  {
    name: "rokki_markets_watchlist_remove",
    description: "Remove a symbol from one of your personal watchlists. Requires write scope.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        watchlist: { type: "string", description: "Watchlist name." },
        symbol: { type: "string", description: "Stock symbol to remove." },
      },
      required: ["watchlist", "symbol"],
      additionalProperties: false,
    },
    handler: async (args, session: AuthedSession) => {
      const name = String(args.watchlist ?? "").trim();
      const symbol = sym(args.symbol);
      if (!name || !symbol)
        return textResult("watchlist and symbol are required.", true);
      const db = mdb();
      const found = await db
        .from("mkt_watchlists")
        .select("id")
        .eq("user_id", session.userId)
        .eq("name", name)
        .maybeSingle();
      const wl = found.data as { id: string } | null;
      if (!wl) return textResult(`Watchlist "${name}" not found.`, true);
      await db
        .from("mkt_watchlist_symbols")
        .delete()
        .eq("watchlist_id", wl.id)
        .eq("symbol", symbol);
      return textResult(`Removed ${symbol} from "${name}".`);
    },
  },

  {
    name: "rokki_markets_portfolio_add_lot",
    description:
      "Record a buy/sell lot in one of your personal portfolios (creates it if needed). Requires write scope.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        portfolio: { type: "string", description: "Portfolio name." },
        symbol: { type: "string" },
        side: { type: "string", enum: ["buy", "sell"] },
        quantity: { type: "number", minimum: 0 },
        price: { type: "number", minimum: 0 },
        fees: { type: "number", minimum: 0 },
        trade_date: { type: "string", format: "date", description: "YYYY-MM-DD (default today)." },
      },
      required: ["portfolio", "symbol", "side", "quantity", "price"],
      additionalProperties: false,
    },
    handler: async (args, session: AuthedSession) => {
      const name = String(args.portfolio ?? "").trim();
      const symbol = sym(args.symbol);
      const side = args.side === "sell" ? "sell" : "buy";
      const quantity = Number(args.quantity);
      const price = Number(args.price);
      const fees = Number(args.fees ?? 0);
      if (!name || !symbol) return textResult("portfolio and symbol are required.", true);
      if (!(quantity > 0)) return textResult("quantity must be > 0.", true);
      if (!(price >= 0)) return textResult("price must be ≥ 0.", true);
      const tradeDate =
        typeof args.trade_date === "string"
          ? args.trade_date
          : new Date().toISOString().slice(0, 10);

      const db = mdb();
      const existing = await db
        .from("mkt_portfolios")
        .select("id, name, user_id, base_currency")
        .eq("user_id", session.userId)
        .eq("name", name)
        .maybeSingle();
      let pf = existing.data as PortfolioRow | null;
      if (!pf) {
        const created = await db
          .from("mkt_portfolios")
          .insert({
            user_id: session.userId,
            name,
            base_currency: "USD",
            created_by: session.userId,
          })
          .select("id, name, user_id, base_currency")
          .single();
        if (created.error || !created.data)
          return textResult(
            `Could not create portfolio: ${created.error?.message ?? "unknown"}`,
            true,
          );
        pf = created.data as PortfolioRow;
      }
      const { error } = await db.from("mkt_lots").insert({
        portfolio_id: pf.id,
        symbol,
        side,
        quantity,
        price,
        fees,
        trade_date: tradeDate,
      });
      if (error) return textResult(`Could not add lot: ${error.message}`, true);
      return textResult(
        `Recorded ${side} ${quantity} ${symbol} @ ${price} in "${name}".`,
      );
    },
  },

  {
    name: "rokki_markets_portfolio_performance",
    description:
      "Summarize a personal portfolio's holdings, market value, and unrealized P/L using live quotes.",
    inputSchema: {
      type: "object",
      properties: {
        portfolio: { type: "string", description: "Portfolio name." },
      },
      required: ["portfolio"],
      additionalProperties: false,
    },
    handler: async (args, session: AuthedSession) => {
      const name = String(args.portfolio ?? "").trim();
      if (!name) return textResult("portfolio is required.", true);
      const db = mdb();
      const found = await db
        .from("mkt_portfolios")
        .select("id, name, user_id, base_currency")
        .eq("user_id", session.userId)
        .eq("name", name)
        .maybeSingle();
      const pf = found.data as PortfolioRow | null;
      if (!pf) return textResult(`Portfolio "${name}" not found.`, true);
      const { data: lotData } = await db
        .from("mkt_lots")
        .select("symbol, side, quantity, price, fees, trade_date")
        .eq("portfolio_id", pf.id);
      const lots = (lotData ?? []) as LotRow[];

      // Net positions via average-cost accounting.
      const acc = new Map<string, { qty: number; cost: number }>();
      for (const lot of lots
        .slice()
        .sort((a, b) => (a.trade_date < b.trade_date ? -1 : 1))) {
        const cur = acc.get(lot.symbol) ?? { qty: 0, cost: 0 };
        const q = Number(lot.quantity);
        const px = Number(lot.price);
        const fees = Number(lot.fees);
        if (lot.side === "buy") {
          cur.qty += q;
          cur.cost += q * px + fees;
        } else {
          const avg = cur.qty > 0 ? cur.cost / cur.qty : 0;
          const s = Math.min(q, cur.qty);
          cur.cost -= avg * s;
          cur.qty -= s;
        }
        acc.set(lot.symbol, cur);
      }
      const open = Array.from(acc.entries()).filter(([, v]) => v.qty > 1e-9);
      if (open.length === 0) return textResult(`"${name}" has no open positions.`);

      let mv = 0;
      let cb = 0;
      const lines: string[] = [];
      for (const [symbol, v] of open) {
        const q = await finnhubQuote(symbol);
        const price = q?.c ?? null;
        const value = price !== null ? price * v.qty : null;
        const pl = value !== null ? value - v.cost : null;
        if (value !== null) mv += value;
        cb += v.cost;
        lines.push(
          `• ${symbol}: ${v.qty} sh, cost $${v.cost.toFixed(0)}` +
            (value !== null
              ? `, value $${value.toFixed(0)}, P/L ${pl! >= 0 ? "+" : ""}$${pl!.toFixed(0)}`
              : ", quote unavailable"),
        );
      }
      const totalPl = mv - cb;
      return textResult(
        `${pf.name} (${pf.base_currency}):\n${lines.join("\n")}\n` +
          `Total value $${mv.toFixed(0)} · cost $${cb.toFixed(0)} · unrealized ${totalPl >= 0 ? "+" : ""}$${totalPl.toFixed(0)} (${cb > 0 ? ((totalPl / cb) * 100).toFixed(2) : "0.00"}%).`,
      );
    },
  },

  {
    name: "rokki_markets_alerts",
    description: "List your active price alerts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, session: AuthedSession) => {
      const db = mdb();
      const { data: alertData } = await db
        .from("mkt_alerts")
        .select("symbol, condition, threshold, active")
        .eq("user_id", session.userId);
      const alerts = (alertData ?? []) as AlertRow[];
      if (alerts.length === 0) return textResult("No alerts set.");
      return textResult(
        alerts
          .map(
            (a) =>
              `• ${a.symbol} ${a.condition} ${a.threshold}${a.active ? "" : " (paused)"}`,
          )
          .join("\n"),
      );
    },
  },

  {
    name: "rokki_markets_alert_create",
    description:
      "Create a personal price alert. condition ∈ price_above|price_below|pct_up|pct_down. Requires write scope.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        condition: {
          type: "string",
          enum: ["price_above", "price_below", "pct_up", "pct_down"],
        },
        threshold: { type: "number" },
      },
      required: ["symbol", "condition", "threshold"],
      additionalProperties: false,
    },
    handler: async (args, session: AuthedSession) => {
      const symbol = sym(args.symbol);
      const condition = String(args.condition ?? "");
      const threshold = Number(args.threshold);
      const valid = ["price_above", "price_below", "pct_up", "pct_down"];
      if (!symbol) return textResult("symbol is required.", true);
      if (!valid.includes(condition))
        return textResult(`condition must be one of ${valid.join(", ")}.`, true);
      if (Number.isNaN(threshold))
        return textResult("threshold must be a number.", true);
      const db = mdb();
      const { error } = await db.from("mkt_alerts").insert({
        user_id: session.userId,
        symbol,
        condition,
        threshold,
        active: true,
      });
      if (error) return textResult(`Could not create alert: ${error.message}`, true);
      return textResult(`Alert set: ${symbol} ${condition} ${threshold}.`);
    },
  },
];
