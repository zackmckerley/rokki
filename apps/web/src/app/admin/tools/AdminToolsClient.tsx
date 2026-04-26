"use client";

import { useEffect, useState, useCallback } from "react";
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
  AdminMobileCard,
  AdminMobileField,
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
        <AdminEmpty
          panel
          body={
            filter
              ? "Nothing matches this moderation filter — try clearing it."
              : "Tools published to the marketplace appear here. None yet."
          }
        >
          {filter ? "No tools match." : "No tools published yet."}
        </AdminEmpty>
      ) : (
        <>
          <div className="hidden sm:block">
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
                        <a
                          href={`/tools/${t.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-text-0 hover:text-accent"
                          title="Open marketplace listing in a new tab"
                        >
                          {t.name}
                        </a>
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
                        <ModerationActions
                          slug={t.slug}
                          status={t.moderation_status}
                          busy={busy === t.slug}
                          moderate={moderate}
                        />
                      </AdminTd>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </AdminPanel>
          </div>

          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map((t) => (
              <AdminMobileCard key={t.id}>
                <AdminMobileField label="Tool">
                  <a
                    href={`/tools/${t.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-text-0 hover:text-accent"
                    title="Open marketplace listing in a new tab"
                  >
                    {t.name}
                  </a>
                  <div className="font-mono text-[10px] text-text-3">
                    {t.slug}
                  </div>
                </AdminMobileField>
                <AdminMobileField label="Visibility">
                  <AdminBadge>{t.visibility}</AdminBadge>
                </AdminMobileField>
                <AdminMobileField label="Status">
                  <ModerationBadge status={t.moderation_status} />
                </AdminMobileField>
                <AdminMobileField label="Version" mono>
                  v{t.current_version}
                </AdminMobileField>
                <div className="mt-1 flex flex-wrap justify-end gap-1">
                  <ModerationActions
                    slug={t.slug}
                    status={t.moderation_status}
                    busy={busy === t.slug}
                    moderate={moderate}
                  />
                </div>
              </AdminMobileCard>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ModerationActions({
  slug,
  status,
  busy,
  moderate,
}: {
  slug: string;
  status: Row["moderation_status"];
  busy: boolean;
  moderate: (slug: string, status: Row["moderation_status"]) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {status !== "approved" ? (
        <AdminButton
          onClick={() => void moderate(slug, "approved")}
          disabled={busy}
          title="Approve"
        >
          <ShieldCheck className="h-3 w-3" /> Approve
        </AdminButton>
      ) : null}
      {status !== "featured" ? (
        <AdminButton
          variant="accent"
          onClick={() => void moderate(slug, "featured")}
          disabled={busy}
        >
          <Star className="h-3 w-3" /> Feature
        </AdminButton>
      ) : null}
      {status !== "pending" ? (
        <AdminButton
          onClick={() => void moderate(slug, "pending")}
          disabled={busy}
        >
          <Clock className="h-3 w-3" /> Pending
        </AdminButton>
      ) : null}
      {status !== "disabled" ? (
        <AdminButton
          variant="danger"
          onClick={() => void moderate(slug, "disabled")}
          disabled={busy}
        >
          <ShieldOff className="h-3 w-3" /> Disable
        </AdminButton>
      ) : null}
    </div>
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
