"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldOff,
  Star,
  Clock,
  AlertCircle,
  Check,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";

interface Row {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  moderation_status: "approved" | "pending" | "disabled" | "featured";
  current_version: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "", label: "All" },
  { id: "approved", label: "Approved" },
  { id: "pending", label: "Pending" },
  { id: "featured", label: "Featured" },
  { id: "disabled", label: "Disabled" },
];

export function AdminToolsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter) params.set("moderation", filter);
    fetch(`/api/v1/admin/tools?${params.toString()}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((b: { data?: Row[] }) => setRows(b.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      );
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 2500);
  }

  async function moderate(slug: string, status: Row["moderation_status"]) {
    if (status === "disabled") {
      if (
        !confirm(
          `Disable "${slug}"? Existing invocations are blocked immediately and the tool stops appearing in the marketplace. You can re-approve it later.`,
        )
      )
        return;
    }
    setBusy(slug);
    try {
      const r = await fetch(
        `/api/v1/admin/tools/${slug}/moderation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        },
      );
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash(`${slug} → ${status}`);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-1 p-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${
                filter === f.id
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-border bg-bg-2 text-text-2 hover:bg-bg-3"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-3">
          {rows.length} {rows.length === 1 ? "tool" : "tools"}
        </span>
      </div>

      {error ? (
        <p className="flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      ) : null}
      {success ? (
        <p className="flex items-center gap-1 rounded-sm border border-success/40 bg-success-subtle px-3 py-1.5 text-xs text-success">
          <Check className="h-3 w-3" /> {success}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <AdminEmpty>No tools match.</AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Tool</AdminTh>
                <AdminTh>Visibility</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Version</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id}>
                  <AdminTd>
                    <Link
                      href={`/tools/${t.slug}`}
                      className="text-text-0 hover:text-accent"
                    >
                      {t.name}
                    </Link>
                    <div className="font-mono text-[10px] text-text-3">
                      {t.slug}
                    </div>
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge>{t.visibility}</AdminBadge>
                  </AdminTd>
                  <AdminTd>
                    <ModerationBadge status={t.moderation_status} />
                  </AdminTd>
                  <AdminTd mono>v{t.current_version}</AdminTd>
                  <AdminTd align="right">
                    <div className="flex justify-end gap-1">
                      {t.moderation_status !== "approved" ? (
                        <AdminButton
                          onClick={() => void moderate(t.slug, "approved")}
                          disabled={busy === t.slug}
                          title="Approve"
                        >
                          <ShieldCheck className="h-3 w-3" /> Approve
                        </AdminButton>
                      ) : null}
                      {t.moderation_status !== "featured" ? (
                        <AdminButton
                          variant="accent"
                          onClick={() => void moderate(t.slug, "featured")}
                          disabled={busy === t.slug}
                        >
                          <Star className="h-3 w-3" /> Feature
                        </AdminButton>
                      ) : null}
                      {t.moderation_status !== "pending" ? (
                        <AdminButton
                          onClick={() => void moderate(t.slug, "pending")}
                          disabled={busy === t.slug}
                        >
                          <Clock className="h-3 w-3" /> Pending
                        </AdminButton>
                      ) : null}
                      {t.moderation_status !== "disabled" ? (
                        <AdminButton
                          variant="danger"
                          onClick={() => void moderate(t.slug, "disabled")}
                          disabled={busy === t.slug}
                        >
                          <ShieldOff className="h-3 w-3" /> Disable
                        </AdminButton>
                      ) : null}
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminPanel>
      )}
    </>
  );
}

function ModerationBadge({ status }: { status: Row["moderation_status"] }) {
  switch (status) {
    case "approved":
      return <AdminBadge variant="success">approved</AdminBadge>;
    case "featured":
      return <AdminBadge variant="accent">featured</AdminBadge>;
    case "pending":
      return <AdminBadge variant="warning">pending</AdminBadge>;
    case "disabled":
      return <AdminBadge variant="danger">disabled</AdminBadge>;
  }
}

async function msg(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}
