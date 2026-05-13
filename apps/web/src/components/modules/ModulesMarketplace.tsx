"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CatalogEntry {
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  scopes: string[];
}

interface InstalledEntry {
  slug: string;
  installed_at: string;
  installed_by: string;
}

interface Props {
  scopeKind: "space" | "terminal";
  /** For space: the slug. For terminal: the ticker. */
  scopeKey: string;
  /** Display name of the scope for headings. */
  scopeLabel: string;
  /** Full catalog filtered to slugs valid for `scopeKind`. */
  catalog: CatalogEntry[];
  /** Currently installed (non-archived) slugs at this scope. */
  installed: InstalledEntry[];
}

/**
 * Module marketplace UI rendered on the space/terminal settings page.
 *
 * Lists every catalog row valid at the current scope, with an Install
 * button for not-yet-installed modules and an Archive button for
 * installed ones. Optimistic-UI per click — the button shows a
 * pending state while the API call lands, then `router.refresh()`
 * pulls the new list from the server.
 *
 * Install / archive endpoints are the same ones the MCP tools call,
 * so the surface is fully API-parity per ADR 0003.
 */
export function ModulesMarketplace({
  scopeKind,
  scopeKey,
  scopeLabel,
  catalog,
  installed,
}: Props) {
  const router = useRouter();
  const installedSet = new Set(installed.map((i) => i.slug));
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  function endpoint(slug?: string): string {
    const base =
      scopeKind === "space"
        ? `/api/v1/spaces/${scopeKey}/modules`
        : `/api/v1/terminals/${scopeKey}/modules`;
    return slug ? `${base}/${slug}` : base;
  }

  async function install(slug: string) {
    setBusy((b) => ({ ...b, [slug]: true }));
    setError(null);
    try {
      const r = await fetch(endpoint(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        throw new Error(
          body.errors?.[0]?.message ?? `Install failed (HTTP ${r.status})`,
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setBusy((b) => ({ ...b, [slug]: false }));
    }
  }

  async function archive(slug: string) {
    setBusy((b) => ({ ...b, [slug]: true }));
    setError(null);
    try {
      const r = await fetch(endpoint(slug), {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        throw new Error(
          body.errors?.[0]?.message ?? `Archive failed (HTTP ${r.status})`,
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setBusy((b) => ({ ...b, [slug]: false }));
    }
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-1">
          Modules · {scopeLabel}
        </h2>
        <p className="font-mono text-[10px] uppercase tracking-wide text-text-3">
          {installed.length} of {catalog.length} installed
        </p>
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-[11px] text-danger"
        >
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border/40 rounded border border-border bg-bg-1">
        {catalog.map((m) => {
          const isInstalled = installedSet.has(m.slug);
          const isBusy = !!busy[m.slug];
          return (
            <li
              key={m.slug}
              className="flex items-start gap-3 px-3 py-2.5 text-xs"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border",
                  isInstalled
                    ? "border-accent bg-accent-subtle text-accent"
                    : "border-border bg-bg-2 text-text-3",
                )}
              >
                {isInstalled ? <Check className="h-3 w-3" /> : null}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-text-0">
                  <b>{m.name}</b>{" "}
                  <span className="font-mono text-[10px] text-text-3">
                    {m.slug}
                  </span>
                </p>
                <p className="text-text-2">{m.description}</p>
              </div>
              {isInstalled ? (
                <button
                  type="button"
                  onClick={() => void archive(m.slug)}
                  disabled={isBusy}
                  aria-label={`Archive ${m.name}`}
                  className="flex flex-shrink-0 items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[10px] uppercase tracking-wide text-text-2 hover:border-danger/40 hover:bg-bg-3 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  <span>{isBusy ? "…" : "Archive"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void install(m.slug)}
                  disabled={isBusy}
                  aria-label={`Install ${m.name}`}
                  className="flex flex-shrink-0 items-center gap-1 rounded-sm border border-accent/40 bg-accent-subtle px-2 py-1 text-[10px] uppercase tracking-wide text-accent hover:border-accent hover:bg-accent hover:text-bg-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  <span>{isBusy ? "…" : "Install"}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-text-3">
        Archive preserves data — reinstalling restores the module&apos;s previous
        state. Per-module config wizards land later; the v1 install just adds
        the module to the tab strip.
      </p>
    </div>
  );
}
