/**
 * Price-alert evaluator (system job — runs from the cron route).
 *
 * Pulls active alerts, fetches each distinct symbol's quote (cached, 60s),
 * and fires a `notifications` row for any tripped alert that's outside its
 * cooldown. Uses the service-role client because this is a system job, not a
 * user-initiated mutation (rokki/CLAUDE.md exception).
 */
import "server-only";
import { marketsAdmin, marketsAdminBase } from "./admin";
import { getQuotesCached } from "./cache";
import type { MktAlertRow } from "./db";
import type { Quote } from "./providers/types";

/** Don't re-fire the same alert more than once per 6h. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

function tripped(alert: MktAlertRow, quote: Quote): boolean {
  switch (alert.condition) {
    case "price_above":
      return quote.price >= alert.threshold;
    case "price_below":
      return quote.price <= alert.threshold;
    case "pct_up":
      return quote.changePct >= alert.threshold;
    case "pct_down":
      return quote.changePct <= alert.threshold;
    default:
      return false;
  }
}

function phrase(alert: MktAlertRow, quote: Quote): string {
  switch (alert.condition) {
    case "price_above":
      return `${alert.symbol} rose above ${alert.threshold} (now ${quote.price.toFixed(2)})`;
    case "price_below":
      return `${alert.symbol} fell below ${alert.threshold} (now ${quote.price.toFixed(2)})`;
    case "pct_up":
      return `${alert.symbol} is up ${quote.changePct.toFixed(2)}% (≥ ${alert.threshold}%)`;
    case "pct_down":
      return `${alert.symbol} is down ${quote.changePct.toFixed(2)}% (≤ ${alert.threshold}%)`;
    default:
      return `${alert.symbol} alert triggered`;
  }
}

export interface AlertRunResult {
  evaluated: number;
  triggered: number;
}

export async function evaluatePriceAlerts(): Promise<AlertRunResult> {
  const admin = marketsAdmin();
  const base = marketsAdminBase();

  const { data: alerts } = await admin
    .from("mkt_alerts")
    .select("*")
    .eq("active", true);
  const list = (alerts ?? []) as MktAlertRow[];
  if (list.length === 0) return { evaluated: 0, triggered: 0 };

  const symbols = Array.from(new Set(list.map((a) => a.symbol)));
  const quotes = await getQuotesCached(symbols, 60_000);

  const now = Date.now();
  let triggered = 0;

  for (const a of list) {
    const q = quotes[a.symbol];
    if (!q || !tripped(a, q)) continue;
    if (
      a.last_triggered_at &&
      now - new Date(a.last_triggered_at).getTime() < COOLDOWN_MS
    ) {
      continue;
    }

    await base.from("notifications").insert({
      user_id: a.user_id,
      kind: "system",
      title: `Price alert: ${a.symbol}`,
      body: phrase(a, q),
      entity_type: "mkt_alert",
      entity_id: a.id,
      url: `/app/markets/quote/${encodeURIComponent(a.symbol)}`,
    } as never);

    await admin
      .from("mkt_alerts")
      .update({ last_triggered_at: new Date().toISOString() })
      .eq("id", a.id);

    triggered += 1;
  }

  return { evaluated: list.length, triggered };
}
