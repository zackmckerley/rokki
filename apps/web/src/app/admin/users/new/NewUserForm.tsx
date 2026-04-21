"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle } from "lucide-react";
import { AdminButton, AdminPanel } from "@/components/admin/primitives";
import { detectClientTimezone } from "@/lib/timezone";

/**
 * Form to create a user via POST /api/v1/admin/users. Offers two modes:
 *   - Magic-link invite (default) — leaves password unset server-side, sends welcome
 *   - Set initial password — useful when rolling out service accounts or when
 *     the recipient can't receive email quickly
 */
export function NewUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [timezone, setTimezone] = useState(() => detectClientTimezone() ?? "");
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim() || undefined,
          timezone: timezone || undefined,
          password: mode === "password" ? password : undefined,
          send_welcome_email: mode === "invite",
          is_platform_admin: isPlatformAdmin,
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const body = (await r.json()) as { data: { user_id: string } };
      router.push(`/admin/users/${body.data.user_id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPanel>
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <Row label="Email" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Row>
        <Row label="Full name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Row>
        <Row label="Timezone (IANA)">
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            maxLength={60}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Row>
        <Row label="Sign-in">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={mode === "invite"}
                onChange={() => setMode("invite")}
              />
              <span>Send welcome email (magic link)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={mode === "password"}
                onChange={() => setMode("password")}
              />
              <span>Set an initial password</span>
            </label>
            {mode === "password" ? (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                required={mode === "password"}
                className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
              />
            ) : null}
          </div>
        </Row>
        <Row label="Platform admin">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPlatformAdmin}
              onChange={(e) => setIsPlatformAdmin(e.target.checked)}
            />
            <span>Grants full platform-admin access. Reserved for operators.</span>
          </label>
        </Row>

        <footer className="mt-2 flex items-center justify-end gap-3">
          {error ? (
            <span className="flex items-center gap-1 text-xs text-danger">
              <AlertCircle className="h-3 w-3" />
              {error}
            </span>
          ) : null}
          <AdminButton type="submit" variant="accent" disabled={saving}>
            <Check className="h-3 w-3" />
            {saving ? "Creating…" : "Create user"}
          </AdminButton>
        </footer>
      </form>
    </AdminPanel>
  );
}

function Row({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid grid-cols-1 gap-1 md:grid-cols-[160px_1fr] md:items-start md:gap-3">
      <span className="pt-1.5 text-[10px] uppercase tracking-wide text-text-3">
        {label}
        {required ? " *" : ""}
      </span>
      <div>{children}</div>
    </label>
  );
}
