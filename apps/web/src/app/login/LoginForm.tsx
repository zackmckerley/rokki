"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
 * disambiguates by which field is present (email vs username).
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to") ?? "/";
  const callbackError = searchParams.get("error");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">(
    callbackError ? "error" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState(
    callbackError ? humanizeAuthError(callbackError) : "",
  );

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
    // Session cookie is set on the response. Push to the intended
    // destination and let the server components pick up the session.
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
      <Input
        name="password"
        type="password"
        autoComplete="current-password"
        required
        placeholder="••••••••"
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={state === "error" ? errorMessage : undefined}
      />
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
