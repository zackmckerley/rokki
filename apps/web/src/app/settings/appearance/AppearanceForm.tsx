"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Rows3, Rows4, Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export type Theme = "dark" | "light" | "system";

/**
 * Appearance: density picker + light/dark/system theme. Both save to
 * `profiles.preferences` and flip the `<html>` dataset immediately so the
 * change lands without a reload.
 */
export function AppearanceForm({
  initialDensity,
  initialTheme = "dark",
}: {
  initialDensity: "cozy" | "compact";
  initialTheme?: Theme;
}) {
  const router = useRouter();
  const [density, setDensity] = useState<"cozy" | "compact">(initialDensity);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function pickDensity(next: "cozy" | "compact") {
    if (next === density || saving) return;
    setDensity(next);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.density = next;
      try {
        localStorage.setItem("rokki_density", next);
      } catch {}
    }
    await save({ density: next });
  }

  async function pickTheme(next: Theme) {
    if (next === theme || saving) return;
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem("rokki_theme", next);
    } catch {}
    await save({ theme: next });
  }

  async function save(pref: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferences: pref }),
      });
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded border border-border bg-bg-1 p-5">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-3">
            Theme
          </h2>
          <p className="mt-1 text-xs text-text-3">
            &ldquo;System&rdquo; follows your OS preference; otherwise it&apos;s
            fixed.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <ThemeCard
            label="Dark"
            icon={<Moon className="h-5 w-5" />}
            active={theme === "dark"}
            onClick={() => void pickTheme("dark")}
          />
          <ThemeCard
            label="Light"
            icon={<Sun className="h-5 w-5" />}
            active={theme === "light"}
            onClick={() => void pickTheme("light")}
          />
          <ThemeCard
            label="System"
            icon={<Monitor className="h-5 w-5" />}
            active={theme === "system"}
            onClick={() => void pickTheme("system")}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded border border-border bg-bg-1 p-5">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-3">
            Density
          </h2>
          <p className="mt-1 text-xs text-text-3">
            Compact tightens list rows by ~30% across every pane.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ThemeCard
            label="Cozy"
            icon={<Rows3 className="h-5 w-5" />}
            active={density === "cozy"}
            onClick={() => void pickDensity("cozy")}
          />
          <ThemeCard
            label="Compact"
            icon={<Rows4 className="h-5 w-5" />}
            active={density === "compact"}
            onClick={() => void pickDensity("compact")}
          />
        </div>
      </section>

      <footer className="flex h-4 items-center">
        {savedAt ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : saving ? (
          <span className="text-xs text-text-3">Saving…</span>
        ) : null}
      </footer>
    </div>
  );
}

/**
 * Applies the chosen theme to <html>. Call on every change and on
 * mount. For "system", listens for prefers-color-scheme media queries.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (theme === "system") {
    const match = window.matchMedia("(prefers-color-scheme: dark)");
    html.dataset.theme = match.matches ? "dark" : "light";
    return;
  }
  html.dataset.theme = theme;
}

function ThemeCard({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-2 rounded border p-4 text-sm transition-colors",
        active
          ? "border-accent bg-accent-subtle text-accent"
          : "border-border bg-bg-0 text-text-1 hover:bg-bg-2",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
