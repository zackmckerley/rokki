"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

const LAST_IDENTIFIER_KEY = "rokki:last-login-identifier";
const REMEMBER_KEY = "rokki:remember-me";

/**
 * Login form. Closed system — accounts are created by platform admins
 * only. There is no self-signup, no magic-link path, no "request access"
 * affordance. The only way in is with credentials an admin already
 * provisioned for you.
 *
 * Identifier is either:
 *   - An email (admin@rokki.local, you@example.com, …)
 *   - A short allow-listed username (e.g. `admin`) the password-login
 *     endpoint maps to a pseudo-email.
 *
 * Both paths POST to /api/v1/auth/password-login. The endpoint
 * disambiguates by which field is present (email vs username) and
 * honours the `remember` flag by clamping session-cookie lifetime.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to") ?? "/";
  const callbackError = searchParams.get("error");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [state, setState] = useState<"idle" | "sending" | "error">(
    callbackError ? "error" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState(
    callbackError ? humanizeAuthError(callbackError) : "",
  );

  // Hydrate the saved identifier + remember preference on mount. We
  // intentionally only ever save the identifier (email or username) —
  // the password is the browser's own password-manager job and we don't
  // want it living in localStorage.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_IDENTIFIER_KEY);
      if (saved) setIdentifier(saved);
      const rememberPref = window.localStorage.getItem(REMEMBER_KEY);
      if (rememberPref === "0") setRemember(false);
    } catch {
      // localStorage can throw in private mode / strict CSP — fall through
      // with default state.
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = identifier.trim();
    if (!id || !password) return;

    setState("sending");
    setErrorMessage("");

    // If the identifier looks like an email, send it as `email`; otherwise
    // pass it as `username` and let the server map it via its allow-list.
    const isEmail = id.includes("@");
    const body = isEmail
      ? { email: id, password, remember }
      : { username: id, password, remember };

    const r = await fetch("/api/v1/auth/password-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      setState("error");
      setErrorMessage(await messageOf(r));
      return;
    }

    // Persist the identifier + preference for next visit.
    try {
      if (remember) {
        window.localStorage.setItem(LAST_IDENTIFIER_KEY, id);
        window.localStorage.setItem(REMEMBER_KEY, "1");
      } else {
        window.localStorage.removeItem(LAST_IDENTIFIER_KEY);
        window.localStorage.setItem(REMEMBER_KEY, "0");
      }
    } catch {
      // ignore — non-fatal
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        name="identifier"
        autoComplete="username email"
        required
        autoFocus
        placeholder="you@example.com  or  admin"
        label="Email or username"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />

      <PasswordField
        value={password}
        onChange={setPassword}
        show={showPassword}
        onToggleShow={() => setShowPassword((s) => !s)}
        error={state === "error" ? errorMessage : undefined}
      />

      <label className="flex select-none items-center gap-2 pt-0.5 text-xs text-text-2">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-accent"
        />
        <span>Keep me signed in on this device</span>
      </label>

      <Button
        type="submit"
        variant="accent"
        size="lg"
        className="w-full"
        loading={state === "sending"}
      >
        Sign in
      </Button>
      <p className="pt-1 text-center text-[11px] text-text-3">
        Accounts are provisioned by your administrator. No self-signup.
      </p>
    </form>
  );
}

/**
 * Password input + show/hide eye toggle. Inline rather than added to the
 * shared <Input> so we don't carry an end-adornment slot on every other
 * input across the app for one screen's sake.
 */
function PasswordField({
  value,
  onChange,
  show,
  onToggleShow,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="password" className="text-xs font-medium text-text-1">
        Password
      </label>
      <div className="relative">
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 w-full rounded border bg-bg-2 pl-3 pr-9 text-sm text-text-0 placeholder:text-text-3",
            "focus:border-border-focus focus:outline-none",
            error ? "border-danger" : "border-border",
          )}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-3 hover:bg-bg-3 hover:text-text-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
        >
          {show ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

async function messageOf(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

function humanizeAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("expired") || lower.includes("invalid")) {
    return "That sign-in link is expired or has already been used. Ask your administrator to issue a new one.";
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return raw.length > 140 ? raw.slice(0, 140) + "…" : raw;
}
