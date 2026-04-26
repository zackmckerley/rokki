"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Moon, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { PushToggle } from "@/components/PushToggle";

export type NotificationKind =
  | "mention"
  | "assigned"
  | "invite"
  | "comment_reply"
  | "tool_result"
  | "system";

export interface NotificationPrefs {
  digest_frequency: "instant" | "daily" | "off";
  quiet_hours: { start: string; end: string } | null;
  kinds: Record<NotificationKind, boolean>;
}

const KIND_LABELS: Record<NotificationKind, { title: string; subtitle: string }> = {
  mention: {
    title: "Mentions",
    subtitle: "When someone @-mentions you in a comment.",
  },
  assigned: {
    title: "Assignments",
    subtitle: "When a task is assigned to you.",
  },
  invite: {
    title: "Invites",
    subtitle: "When you're invited to a space or terminal.",
  },
  comment_reply: {
    title: "Replies",
    subtitle: "When someone replies in a thread you're part of.",
  },
  tool_result: {
    title: "Tool results",
    subtitle: "When a long-running tool you launched finishes.",
  },
  system: {
    title: "System announcements",
    subtitle: "Rare. Downtime notices, major platform changes.",
  },
};

/**
 * Notification preferences form. Each save patches
 * `profiles.preferences.notifications` as a sub-object so unrelated prefs
 * (density, etc.) stay intact.
 */
export function NotificationsForm({ initial }: { initial: NotificationPrefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: NotificationPrefs) {
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          preferences: { notifications: next },
        }),
      });
      if (!r.ok) {
        const body = (await r.json()) as { errors?: { message: string }[] };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const setKind = (k: NotificationKind, enabled: boolean) =>
    save({ ...prefs, kinds: { ...prefs.kinds, [k]: enabled } });

  const setDigest = (
    frequency: NotificationPrefs["digest_frequency"],
  ) => save({ ...prefs, digest_frequency: frequency });

  const setQuietHours = (quiet: NotificationPrefs["quiet_hours"]) =>
    save({ ...prefs, quiet_hours: quiet });

  return (
    <div className="flex flex-col gap-5">
      <Section title="Browser" icon={<Bell className="h-2.5 w-2.5" />}>
        <PushToggle />
      </Section>

      <Section title="Delivery">
        <ChoiceRow
          label="Instant"
          sub="Get notifications the moment they happen."
          active={prefs.digest_frequency === "instant"}
          onClick={() => void setDigest("instant")}
        />
        <ChoiceRow
          label="Daily digest"
          sub="One email per morning with everything from the last 24 hours."
          active={prefs.digest_frequency === "daily"}
          onClick={() => void setDigest("daily")}
        />
        <ChoiceRow
          label="Off"
          sub="Only in-app notifications. No email."
          active={prefs.digest_frequency === "off"}
          onClick={() => void setDigest("off")}
        />
      </Section>

      <Section
        title="Quiet hours"
        icon={<Moon className="h-2.5 w-2.5" />}
      >
        <QuietHoursRow
          value={prefs.quiet_hours}
          onChange={(v) => void setQuietHours(v)}
        />
      </Section>

      <Section title="Notify me about">
        {(Object.keys(KIND_LABELS) as NotificationKind[]).map((k) => (
          <ToggleRow
            key={k}
            title={KIND_LABELS[k].title}
            subtitle={KIND_LABELS[k].subtitle}
            on={prefs.kinds[k]}
            onChange={(v) => void setKind(k, v)}
          />
        ))}
      </Section>

      <footer className="flex h-4 items-center">
        {error ? (
          <span className="text-xs text-danger">{error}</span>
        ) : savedAt ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : saving ? (
          <span className="text-xs text-text-3">Saving…</span>
        ) : null}
      </footer>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded border border-border bg-bg-1">
      <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {icon}
        {title}
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function ChoiceRow({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
        active ? "bg-accent-subtle/40" : "hover:bg-bg-2",
      )}
    >
      <span
        className={cn(
          "mt-1 h-3 w-3 flex-shrink-0 rounded-full border",
          active ? "border-accent bg-accent" : "border-border",
        )}
      />
      <span className="flex-1">
        <span className="block text-text-0">{label}</span>
        <span className="block text-xs text-text-3">{sub}</span>
      </span>
    </button>
  );
}

function ToggleRow({
  title,
  subtitle,
  on,
  onChange,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-bg-2">
      <span className="flex-1">
        <span className="block text-sm text-text-0">{title}</span>
        <span className="block text-xs text-text-3">{subtitle}</span>
      </span>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-border bg-bg-2 text-accent focus:ring-1 focus:ring-border-focus"
      />
    </label>
  );
}

function QuietHoursRow({
  value,
  onChange,
}: {
  value: NotificationPrefs["quiet_hours"];
  onChange: (v: NotificationPrefs["quiet_hours"]) => void;
}) {
  const enabled = value !== null;
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? value ?? { start: "22:00", end: "07:00" }
                : null,
            )
          }
          className="h-4 w-4 cursor-pointer rounded border-border bg-bg-2 text-accent focus:ring-1 focus:ring-border-focus"
        />
        <span className="text-sm text-text-0">
          Mute non-urgent notifications during quiet hours.
        </span>
      </label>
      {enabled ? (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-text-3">From</span>
          <input
            type="time"
            value={value!.start}
            onChange={(e) =>
              onChange({ ...value!, start: e.target.value })
            }
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <span className="text-text-3">to</span>
          <input
            type="time"
            value={value!.end}
            onChange={(e) =>
              onChange({ ...value!, end: e.target.value })
            }
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <span className="text-text-3">(your timezone)</span>
        </div>
      ) : null}
    </div>
  );
}
