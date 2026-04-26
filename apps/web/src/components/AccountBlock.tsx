"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Rows3,
  Rows4,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDensity } from "@/lib/density";

interface RingEntry {
  user_id: string;
  email: string;
  added_at: string;
}

/**
 * The bottom-rail account dropdown. Single source of truth for every
 * account-related action — multi-account ring switching, add/sign-out,
 * settings, density, and the admin-console toggle.
 *
 * Mounted in two places:
 *   - `dashboard/ExplorerRail` for the regular app shell
 *   - `app/admin/layout` for the admin console sidebar
 *
 * The trigger button shows the avatar + name + email + admin chip; the
 * open dropdown intentionally does NOT repeat that info — see the comment
 * inside the menu.
 *
 * The ring (other accounts) is loaded lazily on first dropdown open so
 * idle renders don't hit /api/v1/auth/accounts.
 */
export function AccountBlock({
  name,
  email,
  isPlatformAdmin,
}: {
  name: string;
  email: string;
  isPlatformAdmin: boolean;
}) {
  const { density, toggle: toggleDensity } = useDensity();
  const pathname = usePathname();
  const inAdmin = pathname?.startsWith("/admin") ?? false;

  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState<RingEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ringLoaded, setRingLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initials =
    (name || email || "?")
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  // Lazy-load the account ring when the dropdown first opens.
  useEffect(() => {
    if (!open || ringLoaded) return;
    setError(null);
    fetch("/api/v1/auth/accounts", { credentials: "include" })
      .then((r) => r.json())
      .then(
        (b: {
          data?: { accounts?: RingEntry[]; active_user_id?: string | null };
        }) => {
          setRing(b.data?.accounts ?? []);
          setActiveId(b.data?.active_user_id ?? null);
        },
      )
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      )
      .finally(() => setRingLoaded(true));
  }, [open, ringLoaded]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setShowAdd(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function switchTo(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      const r = await fetch("/api/v1/auth/accounts/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: userId }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        data?: { switched_to?: string };
        errors?: { code?: string; message: string }[];
      };
      // Diagnostic: surface the entire response shape to the console
      // so the next time switching silently fails we can see exactly
      // why (cookie not set, refresh expired, decryption mismatch, etc.).
      console.info("[AccountBlock] switch response:", {
        ok: r.ok,
        status: r.status,
        body,
      });
      if (!r.ok) {
        const msg =
          body.errors?.[0]?.message ?? `HTTP ${r.status} switching account`;
        setError(msg);
        return;
      }
      // Land on the OTHER account's natural home — admins go to /admin,
      // regular users to /. We don't know yet which (we'd need a /me
      // round-trip), so do a hard reload to / and let the dashboard's
      // pure-admin shortcut redirect to /admin if applicable.
      window.location.href = "/";
    } catch (e) {
      console.error("[AccountBlock] switch threw:", e);
      setError(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setBusy(null);
    }
  }

  async function signOut(scope: "current" | "all") {
    setBusy(scope);
    try {
      const r = await fetch(`/api/v1/auth/sign-out?scope=${scope}`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const body = (await r.json()) as {
        data?: { switched_to?: { user_id?: string } | null };
      };
      if (body.data?.switched_to) {
        window.location.href = "/";
      } else {
        window.location.href = "/login";
      }
    } finally {
      setBusy(null);
    }
  }

  const otherAccounts = ring.filter((r) => r.user_id !== activeId);

  return (
    <div
      className="relative flex-shrink-0 border-t border-border"
      ref={containerRef}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg-2",
          open && "bg-bg-2",
        )}
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-bg-3 text-xs font-semibold text-text-0">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="block truncate text-xs text-text-0">{name}</span>
            {isPlatformAdmin ? (
              <ShieldCheck
                className="h-3 w-3 flex-shrink-0 text-accent"
                aria-label="admin"
              />
            ) : null}
          </span>
          <span className="block truncate font-mono text-[10px] text-text-3">
            {email}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-shrink-0 text-text-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 z-30 mb-0 max-h-[80vh] overflow-y-auto border border-border bg-bg-1 text-xs shadow-lg"
        >
          {/* No duplicate identity header here — the trigger button below
              already shows avatar + name + email + admin chip. Repeating
              it inside the open dropdown is redundant. */}
          {error ? (
            <p className="flex items-center gap-1 border-b border-border bg-danger-subtle px-3 py-1.5 text-[11px] text-danger">
              <AlertCircle className="h-2.5 w-2.5" /> {error}
            </p>
          ) : null}

          {/* Switch-to (other ring accounts) — only visible when there's
              somewhere to switch. */}
          {otherAccounts.length > 0 ? (
            <div className="border-b border-border py-1">
              <p className="px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
                Switch to
              </p>
              <ul role="none">
                {otherAccounts.map((r) => (
                  <li key={r.user_id} role="none">
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => void switchTo(r.user_id)}
                      disabled={busy === r.user_id}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-2",
                        busy === r.user_id && "opacity-60",
                      )}
                    >
                      <RefreshCw className="h-3 w-3 flex-shrink-0 text-text-3" />
                      <span className="flex-1 truncate font-mono text-[11px] text-text-1">
                        {r.email}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Add another account — inline form swaps into this slot. */}
          {showAdd ? (
            <AddAccountForm
              onSuccess={() => {
                window.location.href = "/";
              }}
              onError={setError}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <div className="border-b border-border py-1">
              <button
                role="menuitem"
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-1 hover:bg-bg-2"
              >
                <Plus className="h-3 w-3 flex-shrink-0 text-text-3" />
                Add another account
              </button>
            </div>
          )}

          {/* Preferences */}
          <div className="border-b border-border py-1">
            <Link
              href="/settings"
              role="menuitem"
              className="flex items-center gap-2 px-3 py-1.5 text-text-1 hover:bg-bg-2"
              onClick={() => setOpen(false)}
            >
              <Settings className="h-3 w-3 flex-shrink-0 text-text-3" />{" "}
              Settings
            </Link>
            <Link
              href="/settings/tokens"
              role="menuitem"
              className="flex items-center gap-2 px-3 py-1.5 text-text-1 hover:bg-bg-2"
              onClick={() => setOpen(false)}
            >
              <KeyRound className="h-3 w-3 flex-shrink-0 text-text-3" /> API
              tokens
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                toggleDensity();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-1 hover:bg-bg-2"
            >
              {density === "cozy" ? (
                <Rows3 className="h-3 w-3 flex-shrink-0 text-text-3" />
              ) : (
                <Rows4 className="h-3 w-3 flex-shrink-0 text-text-3" />
              )}
              Density: {density === "cozy" ? "Cozy" : "Compact"}
            </button>
          </div>

          {/* Admin console toggle — only visible to platform admins. */}
          {isPlatformAdmin ? (
            <div className="border-b border-border py-1">
              {inAdmin ? (
                <Link
                  href="/"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-text-1 hover:bg-bg-2"
                  onClick={() => setOpen(false)}
                >
                  <ShieldCheck className="h-3 w-3 flex-shrink-0 text-accent" />
                  Exit admin → Dashboard
                </Link>
              ) : (
                <Link
                  href="/admin"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-text-1 hover:bg-bg-2"
                  onClick={() => setOpen(false)}
                >
                  <ShieldCheck className="h-3 w-3 flex-shrink-0 text-accent" />
                  Open admin console
                </Link>
              )}
            </div>
          ) : null}

          {/* Sign out actions */}
          <div className="py-1">
            <button
              role="menuitem"
              type="button"
              onClick={() => void signOut("current")}
              disabled={busy === "current"}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-1 hover:bg-bg-2"
            >
              <LogOut className="h-3 w-3 flex-shrink-0 text-text-3" />
              Sign out
              {otherAccounts.length > 0 ? " (switch to next)" : ""}
            </button>
            {ring.length > 1 ? (
              <button
                role="menuitem"
                type="button"
                onClick={() => void signOut("all")}
                disabled={busy === "all"}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-danger hover:bg-bg-2"
              >
                <LogOut className="h-3 w-3 flex-shrink-0" />
                Sign out of all accounts
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddAccountForm({
  onSuccess,
  onError,
  onCancel,
}: {
  onSuccess: () => void;
  onError: (m: string) => void;
  onCancel: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setBusy(true);
    try {
      const isEmail = identifier.includes("@");
      const r = await fetch("/api/v1/auth/accounts/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          [isEmail ? "email" : "username"]: identifier.trim(),
          password,
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        onError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 border-b border-border p-3"
    >
      <p className="text-[10px] uppercase tracking-wide text-text-3">
        Add another account
      </p>
      <input
        autoFocus
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="Email or username"
        className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-xs text-text-0 outline-none focus:border-border-focus"
      />
      <p className="text-[10px] text-text-3">
        Magic-link sign-in only stacks one account at a time. Use a password
        (admins) or sign in here once via the regular flow first.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-border bg-bg-2 px-2.5 py-1 text-xs text-text-1 hover:bg-bg-3"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !identifier.trim() || !password}
          className={cn(
            "rounded-sm border border-accent bg-accent px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-bg-0 hover:bg-accent-hover",
            (busy || !identifier.trim() || !password) &&
              "cursor-not-allowed opacity-60",
          )}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
