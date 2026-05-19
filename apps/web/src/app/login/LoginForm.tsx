"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormError } from "@/components/ui/FormError";

/**
 * Login form. Closed system — accounts are created by platform admins
 * only. There is no self-signup, no magic-link path, no "request access"
 * affordance. The only way in is with credentials an admin already
 * provisioned for you.
 *
 * `redirectTo` and `callbackError` are passed in by the server-rendered
 * `page.tsx` (which reads them from `searchParams`). That lets this
 * component SSR fully without needing `useSearchParams` + a Suspense
 * boundary, so the page renders in a single paint with no flash.
 *
 * Identifier is either:
 *   - An email (admin@rokki.local, you@example.com, …)
 *   - A short allow-listed username (e.g. `admin`) the password-login
 *     endpoint maps to a pseudo-email.
 *
 * Both paths POST to /api/v1/auth/password-login. The endpoint
 * disambiguates by which field is present (email vs username).
 */
interface LoginFormProps {
  redirectTo: string;
  callbackError: string | null;
}

export function LoginForm({ redirectTo, callbackError }: LoginFormProps) {
  const router = useRouter();
  const initialError = callbackError ? humanizeAuthError(callbackError) : "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">(
    callbackError ? "error" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState(initialError);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const id = identifier.trim();
    if (!id || !password) return;

    setState("sending");
    setErrorMessage("");

    const isEmail = id.includes("@");
    const body = isEmail
      ? { email: id, password }
      : { username: id, password };

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
    router.replace(redirectTo);
    router.refresh();
  }

  const identifierMissing = !identifier.trim() && submitted;
  const passwordMissing = !password && submitted;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {state === "error" && errorMessage ? (
        <FormError message={errorMessage} />
      ) : null}

      <Field
        id="identifier"
        label="Email or username"
        autoComplete="username email"
        autoFocus
        placeholder="you@example.com  or  admin"
        value={identifier}
        onChange={setIdentifier}
        error={identifierMissing ? "Required" : undefined}
      />

      <Field
        id="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        placeholder="••••••••••••"
        value={password}
        onChange={setPassword}
        error={passwordMissing ? "Required" : undefined}
      />

      <button
        type="submit"
        disabled={state === "sending"}
        className={cn(
          "mt-2 flex h-10 w-full items-center justify-center gap-2 rounded font-sans text-sm font-semibold transition-colors",
          "bg-accent text-bg-0 hover:bg-accent-hover active:bg-accent-active",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-1",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {state === "sending" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>Signing in…</span>
          </>
        ) : (
          <span>Sign in</span>
        )}
      </button>
    </form>
  );
}

/**
 * Local field component — denser + more deliberately styled than the
 * generic Input primitive. Label sits above; input has visible borders,
 * accent-color focus ring, and a 40px height that gives it a more
 * "serious application" feel than the 36px Input default.
 */
function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  type?: "text" | "password";
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-wide text-text-2"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "h-10 rounded border bg-bg-2 px-3 text-sm text-text-0 placeholder:text-text-3",
          "transition-colors focus:outline-none focus:ring-1",
          error
            ? "border-danger focus:border-danger focus:ring-danger"
            : "border-border focus:border-border-focus focus:ring-border-focus",
        )}
      />
      {error ? (
        <span id={`${id}-error`} className="text-[11px] text-danger">
          {error}
        </span>
      ) : null}
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
