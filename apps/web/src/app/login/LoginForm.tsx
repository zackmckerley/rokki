"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to") ?? "/";
  // The callback redirects here with ?error=... when a link is expired or
  // invalid. Surface it so the user knows to request a fresh one.
  const callbackError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    callbackError ? "error" : "idle",
  );
  const [errorMessage, setErrorMessage] = useState(
    callbackError ? humanizeAuthError(callbackError) : "",
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("sending");
    setErrorMessage("");

    // Goes through our proxy so IP + email rate limits apply. The proxy
    // keeps error messages generic — no "user not found" leaks.
    const r = await fetch("/api/v1/auth/send-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), redirect_to: redirectTo }),
    });

    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const body = (await r.json()) as { errors?: { message: string }[] };
        msg = body.errors?.[0]?.message ?? msg;
      } catch {}
      setState("error");
      setErrorMessage(msg);
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
          <span className="font-mono text-text-1">{email}</span>.
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
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        placeholder="you@example.com"
        label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={state === "error" ? errorMessage : undefined}
      />
      <Button
        type="submit"
        variant="accent"
        size="lg"
        className="w-full"
        loading={state === "sending"}
      >
        Send sign-in link
      </Button>
    </form>
  );
}

/**
 * Map Supabase's verbose auth error text to a short user-friendly message.
 * We don't want to print "Token has expired or is invalid" verbatim.
 */
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
