"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json as jsonLang } from "@codemirror/lang-json";
import { Play, Save, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Unified editor for "new tool" and "edit tool". If `initial` is provided
 * we're in edit mode and saving PATCHes; otherwise we POST a new tool.
 */
export interface ToolDraft {
  slug: string;
  name: string;
  description: string;
  input_schema: string; // editing as raw JSON text
  output_schema: string;
  code: string;
  timeout_seconds: number;
  tags: string[];
  visibility: "private" | "org" | "project" | "public";
}

export function ToolEditor({
  initial,
  initialSlug,
  isNew = false,
  currentVersion,
}: {
  initial: ToolDraft;
  initialSlug?: string;
  isNew?: boolean;
  currentVersion?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ToolDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testInput, setTestInput] = useState<string>("{}");
  const [testOutput, setTestOutput] = useState<{
    status?: string;
    output?: unknown;
    logs?: string[];
    duration_ms?: number;
    error_message?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive slug from name when creating and user hasn't set one.
  useEffect(() => {
    if (!isNew) return;
    if (draft.slug && draft.slug !== slugify(initial.name)) return;
    setDraft((d) => ({ ...d, slug: slugify(d.name) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.name, isNew]);

  const inputSchemaValid = useMemo(() => {
    try {
      JSON.parse(draft.input_schema);
      return true;
    } catch {
      return false;
    }
  }, [draft.input_schema]);
  const outputSchemaValid = useMemo(() => {
    if (!draft.output_schema.trim()) return true;
    try {
      JSON.parse(draft.output_schema);
      return true;
    } catch {
      return false;
    }
  }, [draft.output_schema]);
  const testInputValid = useMemo(() => {
    try {
      JSON.parse(testInput);
      return true;
    } catch {
      return false;
    }
  }, [testInput]);

  async function save() {
    setError(null);
    if (!inputSchemaValid) {
      setError("Input schema must be valid JSON");
      return;
    }
    if (!outputSchemaValid) {
      setError("Output schema must be valid JSON (or empty)");
      return;
    }
    setSaving(true);
    const payload = {
      name: draft.name,
      slug: draft.slug,
      description: draft.description,
      input_schema: JSON.parse(draft.input_schema),
      output_schema: draft.output_schema.trim()
        ? JSON.parse(draft.output_schema)
        : null,
      code: draft.code,
      timeout_seconds: draft.timeout_seconds,
      tags: draft.tags,
      visibility: draft.visibility,
    };
    try {
      const r = await fetch(
        isNew ? "/api/v1/tools" : `/api/v1/tools/${initialSlug ?? draft.slug}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );
      if (!r.ok) {
        const body = (await r.json()) as { errors?: { message: string }[] };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      if (isNew) router.push(`/tools/${draft.slug}`);
      else router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (!testInputValid) {
      setError("Test input must be valid JSON");
      return;
    }
    setError(null);
    setTesting(true);
    setTestOutput(null);
    try {
      const r = await fetch(
        `/api/v1/tools/${initialSlug ?? draft.slug}/invoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            input: JSON.parse(testInput),
            scripts: { "index.js": draft.code },
            entrypoint: "index.js",
          }),
        },
      );
      if (!r.ok) {
        const body = (await r.json()) as { errors?: { message: string }[] };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const body = (await r.json()) as { data: typeof testOutput };
      setTestOutput(body.data);
    } finally {
      setTesting(false);
    }
  }

  async function del() {
    if (!confirm(`Delete ${draft.slug}? This cannot be undone.`)) return;
    const r = await fetch(`/api/v1/tools/${initialSlug ?? draft.slug}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) router.push("/tools");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header metadata */}
      <div className="rounded border border-border bg-bg-1 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(e) =>
                setDraft({ ...draft, name: e.target.value })
              }
              placeholder="Weather lookup"
              className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </Field>
          <Field label="Slug">
            <input
              value={draft.slug}
              onChange={(e) =>
                setDraft({ ...draft, slug: e.target.value.toLowerCase() })
              }
              disabled={!isNew}
              placeholder="weather-lookup"
              className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-xs text-text-0 outline-none focus:border-border-focus disabled:opacity-60"
            />
          </Field>
          <Field label="Description" full>
            <textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="What the tool does, when to use it, what each input means."
              className="min-h-[60px] w-full resize-y rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </Field>
          <Field label="Visibility">
            <select
              value={draft.visibility}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  visibility: e.target.value as ToolDraft["visibility"],
                })
              }
              className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
            >
              <option value="private">Private (only me)</option>
              <option value="org">Org (everyone in my org)</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <Field label="Timeout (seconds)">
            <input
              type="number"
              min={1}
              max={30}
              value={draft.timeout_seconds}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  timeout_seconds: Math.min(
                    30,
                    Math.max(1, Number(e.target.value)),
                  ),
                })
              }
              className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </Field>
          <Field label="Tags (comma separated)" full>
            <input
              value={draft.tags.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="weather, api, demo"
              className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-xs text-text-0 outline-none focus:border-border-focus"
            />
          </Field>
        </div>
        {currentVersion ? (
          <p className="mt-3 text-xs text-text-3">
            Current version: v{currentVersion} · Saving a code change bumps
            to the next patch.
          </p>
        ) : null}
      </div>

      {/* Code + schemas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-3">
              Code
            </span>
            <span className="font-mono text-[10px] text-text-3">
              index.js · export `run(input)` / `main(input)` / `handler(input)`
            </span>
          </div>
          <div className="overflow-hidden rounded border border-border bg-bg-1">
            <CodeMirror
              value={draft.code}
              height="400px"
              theme="dark"
              extensions={[javascript({ typescript: true, jsx: false })]}
              onChange={(v) => setDraft({ ...draft, code: v })}
              basicSetup={{ lineNumbers: true, foldGutter: true }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <SchemaEditor
            label="Input schema"
            value={draft.input_schema}
            onChange={(v) => setDraft({ ...draft, input_schema: v })}
            valid={inputSchemaValid}
          />
          <SchemaEditor
            label="Output schema (optional)"
            value={draft.output_schema}
            onChange={(v) => setDraft({ ...draft, output_schema: v })}
            valid={outputSchemaValid}
          />
        </div>
      </div>

      {/* Test runner */}
      <div className="rounded border border-border bg-bg-1">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-3">
            <Sparkles className="h-3 w-3" /> Test run
          </span>
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !testInputValid}
            className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-xs text-bg-0 disabled:opacity-40"
          >
            <Play className="h-3 w-3" /> {testing ? "Running…" : "Run"}
          </button>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-text-3">
                Input
              </span>
              {!testInputValid ? (
                <span className="text-[10px] text-danger">invalid JSON</span>
              ) : null}
            </div>
            <CodeMirror
              value={testInput}
              height="180px"
              theme="dark"
              extensions={[jsonLang()]}
              onChange={setTestInput}
              basicSetup={{ lineNumbers: false }}
            />
          </div>
          <div className="p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-text-3">
                Output
              </span>
              {testOutput?.duration_ms != null ? (
                <span className="font-mono text-[10px] text-text-3">
                  {testOutput.duration_ms}ms · {testOutput.status}
                </span>
              ) : null}
            </div>
            <div className="h-[180px] overflow-y-auto rounded-sm bg-bg-0 p-2 font-mono text-[11px] text-text-0">
              {!testOutput ? (
                <span className="text-text-3">
                  Press Run to execute the current code.
                </span>
              ) : testOutput.status === "success" ? (
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(testOutput.output, null, 2)}
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap text-danger">
                  {testOutput.error_message ?? testOutput.status}
                </pre>
              )}
              {testOutput?.logs && testOutput.logs.length > 0 ? (
                <div className="mt-2 border-t border-border pt-2">
                  <span className="text-[10px] uppercase text-text-3">
                    logs
                  </span>
                  {testOutput.logs.map((l, i) => (
                    <div key={i} className="text-text-2">
                      {l}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {error ? (
          <span className="text-xs text-danger">{error}</span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {!isNew ? (
            <button
              onClick={del}
              className="flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger-subtle"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          ) : null}
          <button
            onClick={save}
            disabled={saving}
            className={cn(
              "flex items-center gap-1 rounded-sm bg-accent px-3 py-1.5 text-sm text-bg-0 hover:opacity-90 disabled:opacity-40",
            )}
          >
            <Save className="h-3 w-3" />
            {saving
              ? "Saving…"
              : isNew
                ? "Publish v1.0.0"
                : "Save & publish next version"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1", full && "col-span-2")}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {label}
      </span>
      {children}
    </label>
  );
}

function SchemaEditor({
  label,
  value,
  onChange,
  valid,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  valid: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-3">
          {label}
        </span>
        {!valid ? (
          <span className="text-[10px] text-danger">invalid JSON</span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <CodeMirror
          value={value}
          height="180px"
          theme="dark"
          extensions={[jsonLang()]}
          onChange={onChange}
          basicSetup={{ lineNumbers: false }}
        />
      </div>
    </div>
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 62);
}
