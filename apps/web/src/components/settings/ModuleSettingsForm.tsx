"use client";

import Link from "next/link";
import {
  Calendar,
  CheckSquare,
  MessageSquare,
  TrendingUp,
  Target,
  Contact,
  KanbanSquare,
  ChevronUp,
  ChevronDown,
  EyeOff,
  Plus,
  RotateCcw,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useModulePrefs } from "@/components/dashboard/module-visibility";
import { isOpenByDefault, type DashLayoutPreset } from "@/lib/module-prefs";
import {
  SettingsCard,
  SettingRow,
  Toggle,
  SegmentedControl,
} from "./settings-ui";

const ICONS: Record<string, LucideIcon> = {
  week: Calendar,
  tasks: CheckSquare,
  messages: MessageSquare,
  markets: TrendingUp,
  goals: Target,
  contacts: Contact,
  pipeline: KanbanSquare,
};

/** Modules with their own settings page get a Configure gear on their row. */
const MODULE_SETTINGS_HREF: Record<string, string> = {
  messages: "/settings/modules/messages",
};

const LAYOUT_OPTIONS: readonly { value: DashLayoutPreset; label: string }[] = [
  { value: "stacked", label: "Stacked" },
  { value: "split", label: "Split" },
];

/**
 * Full-page module settings — the single-column body of /settings/modules.
 * Reads/writes the same per-user prefs the dashboard does (localStorage,
 * with optional account sync), so changes here show up on the dashboard.
 */
export function ModuleSettingsForm() {
  const ctx = useModulePrefs();
  if (!ctx) return null;
  const {
    prefs,
    visibleModules,
    hiddenModules,
    moveBy,
    setOpenByDefault,
    setHidden,
    setLayout,
    setSectionCollapsed,
    setSync,
    reset,
  } = ctx;

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        title="Modules"
        description="Show, hide, and reorder the modules on your dashboard. Use the arrows to reorder."
        meta={`${visibleModules.length} shown`}
      >
        <div className="divide-y divide-border">
          {visibleModules.map((m, i) => {
            const Icon = ICONS[m.id] ?? CheckSquare;
            return (
              <div key={m.id} className="flex items-center gap-2.5 px-4 py-2">
                <span className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveBy(m.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${m.label} up`}
                    className="text-text-3 hover:text-text-0 disabled:opacity-25"
                  >
                    <ChevronUp className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBy(m.id, 1)}
                    disabled={i === visibleModules.length - 1}
                    aria-label={`Move ${m.label} down`}
                    className="text-text-3 hover:text-text-0 disabled:opacity-25"
                  >
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
                <Icon className="h-3.5 w-3.5 flex-shrink-0 text-text-3" aria-hidden="true" />
                <span className="flex-1 truncate text-xs text-text-1">
                  {m.label}
                </span>
                {MODULE_SETTINGS_HREF[m.id] ? (
                  <Link
                    href={MODULE_SETTINGS_HREF[m.id]}
                    aria-label={`${m.label} settings`}
                    title="Configure"
                    className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-0"
                  >
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : null}
                <span className="flex items-center gap-2 text-2xs text-text-3">
                  Open on load
                  <Toggle
                    checked={isOpenByDefault(prefs, m.id)}
                    onChange={(v) => setOpenByDefault(m.id, v)}
                    label={`Open ${m.label} by default`}
                  />
                </span>
                <button
                  type="button"
                  onClick={() => setHidden(m.id, true)}
                  aria-label={`Hide ${m.label}`}
                  title="Hide this module"
                  className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-danger"
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })}

          {hiddenModules.map((m) => {
            const Icon = ICONS[m.id] ?? CheckSquare;
            return (
              <div key={m.id} className="flex items-center gap-2.5 px-4 py-2">
                <span className="w-3" aria-hidden="true" />
                <Icon
                  className="h-3.5 w-3.5 flex-shrink-0 text-text-disabled"
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-xs text-text-3">
                  {m.label}
                </span>
                <span className="rounded-sm border border-border px-1.5 py-px text-2xs uppercase tracking-wide text-text-3">
                  Hidden
                </span>
                <button
                  type="button"
                  onClick={() => setHidden(m.id, false)}
                  aria-label={`Show ${m.label}`}
                  title="Add back to the dashboard"
                  className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-2xs text-text-2 hover:bg-bg-3 hover:text-text-0"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" /> Add
                </button>
              </div>
            );
          })}

          {visibleModules.length === 0 ? (
            <div className="px-4 py-3 text-2xs text-text-3">
              All modules are hidden — add one back above.
            </div>
          ) : null}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Layout"
        description="How the panels arrange on your dashboard when it loads."
      >
        <div className="px-4 py-3">
          <SegmentedControl
            options={LAYOUT_OPTIONS}
            value={prefs.layout}
            onChange={(v) => setLayout(v)}
            ariaLabel="Default layout"
          />
        </div>
      </SettingsCard>

      <SettingsCard title="Behavior">
        <div className="divide-y divide-border">
          <SettingRow
            label="Collapse modules on load"
            description="Start the MODULES section collapsed in the explorer rail."
          >
            <Toggle
              checked={prefs.sectionCollapsed}
              onChange={(v) => setSectionCollapsed(v)}
              label="Collapse modules on load"
            />
          </SettingRow>
          <SettingRow
            label="Sync across devices"
            description="Save these settings to your account so they follow you to other devices."
          >
            <Toggle
              checked={prefs.sync}
              onChange={(v) => setSync(v)}
              label="Sync across devices"
            />
          </SettingRow>
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          className={cn(
            "flex items-center gap-1.5 rounded-sm border border-border bg-bg-1 px-3 py-1.5",
            "text-2xs font-semibold uppercase tracking-wide text-text-3 hover:bg-bg-2 hover:text-text-1",
          )}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset to defaults
        </button>
      </div>
    </div>
  );
}
