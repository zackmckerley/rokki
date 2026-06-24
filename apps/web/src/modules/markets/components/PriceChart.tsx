"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCandles } from "../lib/client-api";
import { sma, ema } from "@/lib/markets/indicators";
import type { Candle, Range } from "@/lib/markets/providers/types";

const RANGES: Range[] = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"];

const COLORS = {
  up: "#3fb950",
  down: "#f85149",
  line: "#58a6ff",
  ma: "#ff9d00",
  ema: "#bc8cff",
  grid: "#3b3b45",
  text: "#9099a4",
  vol: "#2d2d32",
};

/**
 * Dependency-free canvas price chart. Line/candle modes, range presets, an
 * optional 50-period MA overlay, a volume strip, and a crosshair tooltip.
 * Kept in-house so the build carries no charting dependency.
 */
export function PriceChart({
  symbol,
  initialRange = "1Y",
}: {
  symbol: string;
  initialRange?: Range;
}) {
  const [range, setRange] = useState<Range>(initialRange);
  const [type, setType] = useState<"line" | "candle">("line");
  const [showMA, setShowMA] = useState(true);
  const [showEMA, setShowEMA] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = 340;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCandles(symbol, range)
      .then((c) => {
        if (!cancelled) setCandles(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Chart unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(320, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padL = 8;
    const padR = 54;
    const priceTop = 8;
    const priceBottom = height - 64;
    const volTop = height - 56;
    const volBottom = height - 18;
    const plotW = width - padL - padR;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const range1 = max - min || 1;
    const maxVol = Math.max(...candles.map((c) => c.volume), 1);

    const x = (i: number) => padL + (i / (candles.length - 1)) * plotW;
    const y = (p: number) => priceTop + (1 - (p - min) / range1) * (priceBottom - priceTop);

    // Horizontal grid + price labels
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = COLORS.text;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let g = 0; g <= 4; g++) {
      const p = min + (range1 * g) / 4;
      const yy = y(p);
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(padL + plotW, yy);
      ctx.stroke();
      ctx.fillText(p.toFixed(2), padL + plotW + 4, yy + 3);
    }

    // Volume bars
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]!;
      const bx = x(i);
      const bh = (c.volume / maxVol) * (volBottom - volTop);
      ctx.fillStyle = COLORS.vol;
      const bw = Math.max(1, plotW / candles.length - 1);
      ctx.fillRect(bx - bw / 2, volBottom - bh, bw, bh);
    }

    if (type === "line") {
      ctx.beginPath();
      closes.forEach((c, i) => {
        const xx = x(i);
        const yy = y(c);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    } else {
      const cw = Math.max(1, plotW / candles.length - 1.5);
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i]!;
        const xx = x(i);
        const up = c.close >= c.open;
        ctx.strokeStyle = up ? COLORS.up : COLORS.down;
        ctx.fillStyle = up ? COLORS.up : COLORS.down;
        ctx.beginPath();
        ctx.moveTo(xx, y(c.high));
        ctx.lineTo(xx, y(c.low));
        ctx.stroke();
        const yo = y(c.open);
        const yc = y(c.close);
        const top = Math.min(yo, yc);
        const bh = Math.max(1, Math.abs(yc - yo));
        ctx.fillRect(xx - cw / 2, top, cw, bh);
      }
    }

    // MA overlay
    if (showMA && candles.length > 50) {
      const ma = sma(closes, 50);
      ctx.beginPath();
      let started = false;
      ma.forEach((m, i) => {
        if (m === null) return;
        const xx = x(i);
        const yy = y(m);
        if (!started) {
          ctx.moveTo(xx, yy);
          started = true;
        } else ctx.lineTo(xx, yy);
      });
      ctx.strokeStyle = COLORS.ma;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // EMA overlay
    if (showEMA && candles.length > 21) {
      const e = ema(closes, 21);
      ctx.beginPath();
      let startedE = false;
      e.forEach((m, i) => {
        if (m === null) return;
        const xx = x(i);
        const yy = y(m);
        if (!startedE) {
          ctx.moveTo(xx, yy);
          startedE = true;
        } else ctx.lineTo(xx, yy);
      });
      ctx.strokeStyle = COLORS.ema;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Crosshair
    if (hover !== null && hover >= 0 && hover < candles.length) {
      const xx = x(hover);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(xx, priceTop);
      ctx.lineTo(xx, priceBottom);
      ctx.stroke();
    }
  }, [candles, type, showMA, showEMA, hover, width]);

  useEffect(() => {
    draw();
  }, [draw]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (candles.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const padL = 8;
    const padR = 54;
    const plotW = width - padL - padR;
    const i = Math.round(((px - padL) / plotW) * (candles.length - 1));
    setHover(Math.min(Math.max(i, 0), candles.length - 1));
  }

  const hc = hover !== null ? candles[hover] : null;

  return (
    <div ref={wrapRef} className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${
                range === r
                  ? "bg-bg-3 text-text-0"
                  : "text-text-2 hover:bg-bg-2 hover:text-text-0"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setType(type === "line" ? "candle" : "line")}
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold text-text-2 hover:bg-bg-2 hover:text-text-0"
          >
            {type === "line" ? "Line" : "Candles"}
          </button>
          <button
            onClick={() => setShowMA((v) => !v)}
            className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${
              showMA ? "text-accent" : "text-text-2 hover:text-text-0"
            }`}
          >
            MA50
          </button>
          <button
            onClick={() => setShowEMA((v) => !v)}
            className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${
              showEMA ? "text-accent" : "text-text-2 hover:text-text-0"
            }`}
          >
            EMA21
          </button>
        </div>
      </div>

      <div className="relative">
        {loading && (
          <div className="flex h-[340px] items-center justify-center text-xs text-text-3">
            Loading chart…
          </div>
        )}
        {!loading && error && (
          <div className="flex h-[340px] items-center justify-center text-xs text-danger">
            {error}
          </div>
        )}
        {!loading && !error && candles.length < 2 && (
          <div className="flex h-[340px] items-center justify-center text-xs text-text-3">
            No chart data for this symbol/range.
          </div>
        )}
        {!loading && !error && candles.length >= 2 && (
          <>
            <canvas
              ref={canvasRef}
              style={{ width, height }}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
            {hc && (
              <div className="pointer-events-none absolute left-2 top-2 rounded border border-border bg-bg-1/95 px-2 py-1 font-mono text-[10px] text-text-2">
                {new Date(hc.time * 1000).toLocaleDateString()} · O {hc.open.toFixed(2)} · H{" "}
                {hc.high.toFixed(2)} · L {hc.low.toFixed(2)} · C{" "}
                <span className="text-text-0">{hc.close.toFixed(2)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
