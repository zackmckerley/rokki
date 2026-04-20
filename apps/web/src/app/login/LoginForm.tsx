"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Login form. Handles two flows side-by-side:
 *
 *   1. Email magic link — the primary flow for everyday users. Types a
 *      valid email, we POST /api/v1/auth/send-link, they click the
 *      link in Mailpit / their inbox.
 *
 *   2. Username + password — a narrow backdoor for operators (today:
 *      `admin`). Typed as a bare word (no `@`), we reveal a password
 *      field and POST /api/v1/auth/password-login. Rate-limited
 *      tighter than the magic-link path.
 *
 * We detect which flow by whether the identifier contains `@`. That's
 * crude but it matches user intuition — nobody types their admin
 * username with an @ in it.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to") ?? "/";
  const callbackError = searchParams.get("error");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<
    "idle" | "sending" | "sent" | "error"
  >(callbackError ? "error" : "idle");
  const [errorMessage, setErrorMessage] = useState(
    callbackError ? humanizeAuthError(callbackError) : "",
  );

  const isEmail = identifier.includes("@");
  const showPassword = identifier.trim().length > 0 && !isEmail;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = identifier.trim();
    if (!id) return;

    setState("sending");
    setErrorMessage("");

    if (showPassword) {
      // Username + password path.
      const r = await fetch("/api/v1/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: id, password }),
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
      return;
    }

    // Magic link path.
    const r = await fetch("/api/v1/auth/send-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: id, redirect_to: redirectTo }),
    });

    if (!r.ok) {
      setState("error");
      setErrorMessage(await messageOf(r));
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="rounded border border-border bg-bg-1 p-4 text-center">
        <p className="text-sm text-text-0">Check your email.</p>
        <p className="mt-1 text-xs text-text-2">
          We sent a sign-in link to{" "}
          <span className="font-mono text-text-1">{identifier}</span>.
        </p>
        <p className="mt-3 text-xs text-text-3">
          The link expires in 15 minutes and can only be used once.
        </p>
      </div>
    );
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
        error={!showPassword && state === "error" ? errorMessage : undefined}
      />
      {showPassword ? (
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
      ) : null}
      <Button
        type="submit"
        variant="accent"
        size="lg"
        className="w-full"
        loading={state === "sending"}
      >
        {showPassword ? "Sign in" : "Send sign-in link"}
      </Button>
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
    return "That sign-in link is expired or has already been used. Request a fresh one.";
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return raw.length > 140 ? raw.slice(0, 140) + "…" : raw;
}
