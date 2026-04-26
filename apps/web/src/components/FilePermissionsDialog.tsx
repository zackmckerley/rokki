"use client";

import { useEffect, useState } from "react";
import { Lock, Users, UserCheck, Check, AlertCircle } from "lucide-react";
import { Dialog } from "./Dialog";
import { Avatar } from "./primitives";
import { cn } from "@/lib/utils";

export type FileVisibility = "project" | "owners" | "custom";

export type ProjectRole =
  | "owner"
  | "manager"
  | "architect"
  | "gc"
  | "lender"
  | "family"
  | "guest";

const ROLES: ProjectRole[] = [
  "owner",
  "manager",
  "architect",
  "gc",
  "lender",
  "family",
  "guest",
];

interface TerminalMember {
  user_id: string;
  role: ProjectRole;
  full_name: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  file: {
    id: string;
    filename: string;
    visibility: FileVisibility;
    visibility_roles: ProjectRole[];
    visibility_users: string[];
  };
  ticker: string;
  onSaved: (next: {
    visibility: FileVisibility;
    visibility_roles: ProjectRole[];
    visibility_users: string[];
  }) => void;
}

/**
 * File permissions dialog.
 *
 *   - Project    — any terminal member can read (default for most files)
 *   - Owners     — uploader + terminal owners/managers only (sensitive docs)
 *   - Custom     — owners/managers + explicit role and user grants
 *
 * When Custom is selected, we render two pickers: role chips (toggle which
 * roles get read access) and a member list (checkbox per person). Members
 * are loaded once on open from the terminal's members endpoint.
 */
export function FilePermissionsDialog({
  open,
  onClose,
  file,
  ticker,
  onSaved,
}: Props) {
  const [visibility, setVisibility] = useState<FileVisibility>(file.visibility);
  const [roles, setRoles] = useState<ProjectRole[]>(file.visibility_roles);
  const [userIds, setUserIds] = useState<string[]>(file.visibility_users);
  const [members, setMembers] = useState<TerminalMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Reset state to the file's current values whenever the dialog opens.
    setVisibility(file.visibility);
    setRoles(file.visibility_roles);
    setUserIds(file.visibility_users);
    setError(null);

    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/projects/${ticker}/members`, { credentials: "include" })
      .then((r) => r.json())
      .then(
        (body: {
          data?: {
            members?: Array<{
              user_id: string;
              role: ProjectRole;
              profiles?: { full_name: string | null } | null;
            }>;
          };
        }) => {
          if (cancelled) return;
          const list = (body.data?.members ?? []).map((m) => ({
            user_id: m.user_id,
            role: m.role,
            full_name: m.profiles?.full_name ?? null,
          }));
          setMembers(list);
        },
      )
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [open, ticker, file.id, file.visibility, file.visibility_roles, file.visibility_users]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/files/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          visibility,
          visibility_roles: visibility === "custom" ? roles : [],
          visibility_users: visibility === "custom" ? userIds : [],
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      onSaved({
        visibility,
        visibility_roles: visibility === "custom" ? roles : [],
        visibility_users: visibility === "custom" ? userIds : [],
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(role: ProjectRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function toggleUser(id: string) {
    setUserIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id],
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Permissions — ${file.filename}`}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Who can see this file
          </legend>
          <VisibilityOption
            value="project"
            current={visibility}
            onChange={setVisibility}
            icon={<Users className="h-3.5 w-3.5 text-text-2" />}
            title="Everyone in the terminal"
            body="Any member of this terminal can read."
          />
          <VisibilityOption
            value="owners"
            current={visibility}
            onChange={setVisibility}
            icon={<Lock className="h-3.5 w-3.5 text-text-2" />}
            title="Owners and managers only"
            body="The uploader, plus terminal owners and managers."
          />
          <VisibilityOption
            value="custom"
            current={visibility}
            onChange={setVisibility}
            icon={<UserCheck className="h-3.5 w-3.5 text-text-2" />}
            title="Custom — pick roles and people"
            body="Owners and managers always have access. Add others below."
          />
        </fieldset>

        {visibility === "custom" ? (
          <>
            <div>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
                Grant by role
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {ROLES.filter((r) => r !== "owner" && r !== "manager").map(
                  (r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={roles.includes(r)}
                      onClick={() => toggleRole(r)}
                      className={cn(
                        "rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide transition-colors",
                        roles.includes(r)
                          ? "border-accent bg-accent-subtle text-text-0"
                          : "border-border bg-bg-2 text-text-2 hover:bg-bg-3",
                      )}
                    >
                      {r}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
                Grant by person
              </h3>
              {loading ? (
                <p className="text-xs text-text-3">Loading members…</p>
              ) : members.length === 0 ? (
                <p className="text-xs text-text-3">No other members.</p>
              ) : (
                <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded border border-border bg-bg-0">
                  {members.map((m) => (
                    <li key={m.user_id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-bg-2">
                        <input
                          type="checkbox"
                          checked={userIds.includes(m.user_id)}
                          onChange={() => toggleUser(m.user_id)}
                          className="h-3.5 w-3.5 cursor-pointer rounded-sm border-border bg-bg-2 text-accent focus:ring-1 focus:ring-border-focus"
                        />
                        <Avatar name={m.full_name ?? ""} size="sm" />
                        <span className="flex-1 truncate text-text-1">
                          {m.full_name ?? m.user_id.slice(0, 8)}
                        </span>
                        <span className="font-mono text-[10px] uppercase text-text-3">
                          {m.role}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="flex items-start gap-1.5 rounded-sm border border-info-subtle bg-info-subtle px-2.5 py-1.5 text-[11px] text-info">
              <AlertCircle className="mt-0.5 h-2.5 w-2.5 flex-shrink-0" />
              Owners and managers always keep access — those roles can&apos;t be
              excluded.
            </p>
          </>
        ) : null}

        {error ? (
          <p className="rounded-sm border border-danger/40 bg-danger-subtle px-2.5 py-1.5 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <footer className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border bg-bg-2 px-3 py-1.5 text-xs text-text-1 hover:bg-bg-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-bg-0 hover:bg-accent-hover",
              saving && "cursor-not-allowed opacity-60",
            )}
          >
            <Check className="h-3 w-3" />
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}

function VisibilityOption({
  value,
  current,
  onChange,
  icon,
  title,
  body,
}: {
  value: FileVisibility;
  current: FileVisibility;
  onChange: (v: FileVisibility) => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const active = value === current;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-sm border px-3 py-2 transition-colors",
        active
          ? "border-accent bg-accent-subtle/40"
          : "border-border bg-bg-0 hover:bg-bg-2",
      )}
    >
      <input
        type="radio"
        name="file-visibility"
        value={value}
        checked={active}
        onChange={() => onChange(value)}
        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
      />
      <span className="flex-shrink-0 pt-0.5">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm text-text-0">{title}</span>
        <span className="block text-xs text-text-3">{body}</span>
      </span>
    </label>
  );
}
