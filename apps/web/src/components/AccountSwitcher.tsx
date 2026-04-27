"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  LogOut,
  Plus,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RingEntry {
  user_id: string;
  email: string;
  added_at: string;
}

interface MeData {
  user_id?: string;
  email?: string;
  is_platform_admin?: boolean;
  full_name?: string | null;
}

/**
 * Account switcher in the TopBar. Combines:
 *   - The user's email + admin chip (if applicable)
 *   - A dropdown listing every account in the ring
 *   - "Add another account" → opens an in-place login form
 *   - "Sign out" / "Sign out all"
 *
 * State is loaded lazily on dropdown open to avoid an extra request on
 * every page render.
 */
export function AccountSwitcher() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<MeData | null>(null);
  const [ring, setRing] = useState<RingEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Always load `me` so the chip shows even before the dropdown opens.
    fetch("/api/v1/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { data?: MeData } | null) => setMe(b?.data ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open || loaded) return;
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
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!me?.user_id) return null;

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
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      // Hard reload so server components re-render with the new user.
      window.location.href = "/";
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

  const initials = (me.full_name ?? me.email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-xs text-text-1 hover:bg-bg-3"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bg-3 font-semibold text-text-1">
          {initials || "?"}
        </span>
        {me.is_platform_admin ? (
          <ShieldCheck className="h-3 w-3 text-accent" aria-label="admin" />
        ) : null}
        <ChevronDown className="h-3 w-3 text-text-3" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-border bg-bg-1 shadow-lg"
        >
          <div className="border-b border-border bg-bg-2 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-3 text-xs font-semibold text-text-1">
                {initials || "?"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-text-0">
                  {me.full_name ?? me.email}
                </div>
                <div className="truncate font-mono text-[10px] text-text-3">
                  {me.email}
                </div>
              </div>
              {me.is_platform_admin ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                  <ShieldCheck className="h-2.5 w-2.5" /> admin
                </span>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="flex items-center gap-1 border-b border-border bg-danger-subtle px-3 py-1.5 text-[11px] text-danger">
              <AlertCircle className="h-2.5 w-2.5" /> {error}
            </p>
          ) : null}

          {ring.filter((r) => r.user_id !== activeId).length > 0 ? (
            <div className="border-b border-border py-1">
              <p className="px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
                Switch to
              </p>
              <ul role="none">
                {ring
                  .filter((r) => r.user_id !== activeId)
                  .map((r) => (
                    <li key={r.user_id} role="none">
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => void switchTo(r.user_id)}
                        disabled={busy === r.user_id}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg-2",
                          busy === r.user_id && "opacity-60",
                        )}
                      >
                        <RefreshCw className="h-3 w-3 text-text-3" />
                        <span className="flex-1 truncate font-mono text-xs text-text-1">
                          {r.email}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {showAdd ? (
            <AddAccountForm
              onSuccess={() => {
                window.location.href = "/";
              }}
              onError={setError}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <div className="py-1">
              <button
                role="menuitem"
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-1 hover:bg-bg-2"
              >
                <Plus className="h-3 w-3 text-text-3" />
                Add another account
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => void signOut("current")}
                disabled={busy === "current"}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-1 hover:bg-bg-2"
              >
                <LogOut className="h-3 w-3 text-text-3" />
                Sign out{" "}
                {ring.filter((r) => r.user_id !== activeId).length > 0
                  ? "(switch to next)"
                  : ""}
              </button>
              {ring.length > 1 ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => void signOut("all")}
                  disabled={busy === "all"}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger hover:bg-bg-2"
                >
                  <LogOut className="h-3 w-3" />
                  Sign out of all accounts
                </button>
              ) : null}
            </div>
          )}
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
    <form onSubmit={submit} className="flex flex-col gap-2 p-3">
      <p className="text-[10px] uppercase tracking-wide text-text-3">
        Add another account
      </p>
      <input
        autoFocus
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="Email or username"
        aria-label="Email or username"
        className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
      />
      <p className="text-[10px] text-text-3">
        Magic-link sign-in only stacks one account at a time. Use a
        password (admins) or sign in here once via the regular flow first.
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
