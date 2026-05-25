"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "./Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { FormError } from "./ui/FormError";
import { FieldHint } from "./ui/FieldHint";

interface Org {
  id: string;
  slug: string;
  name: string;
}

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  orgs: Org[];
  /** Pre-select a space by slug — used by the explorer's + buttons. */
  preferredSlug?: string;
}

/**
 * New-terminal dialog. A terminal is a single working context — a project,
 * matter, client, or goal. Ticker is auto-generated server-side from the
 * name and used only for URL routing; users never see or pick it.
 */
export function CreateProjectDialog({
  open,
  onClose,
  orgs,
  preferredSlug,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setError("");
      setSubmitted(false);
      return;
    }
    // On open, honour a pre-selected space slug if it's in the user's list.
    if (preferredSlug) {
      const match = orgs.find((o) => o.slug === preferredSlug);
      if (match) setOrgId(match.id);
    }
  }, [open, preferredSlug, orgs]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        space_id: orgId,
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    });
    const body = (await res.json()) as {
      data?: { slug?: string; ticker: string };
      errors?: { message: string }[];
    };
    if (!res.ok || !body.data) {
      setError(body.errors?.[0]?.message ?? "Failed to create terminal");
      setLoading(false);
      return;
    }
    onClose();
    // Prefer the slug for the post-create URL (clean, name-derived).
    // Fall back to the legacy ticker if the server response doesn't
    // include slug — the route resolver accepts either.
    router.push(`/p/${body.data.slug ?? body.data.ticker}`);
  }

  return (
    <Dialog open={open} onClose={onClose} title="New terminal">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <FormError message={error} />
        {orgs.length > 1 ? (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="create-terminal-space"
              className="text-xs font-medium text-text-1"
            >
              Space
            </label>
            <select
              id="create-terminal-space"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="h-9 rounded border border-border bg-bg-2 px-3 text-sm text-text-0 focus:border-border-focus focus:outline-none"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <Input
          name="name"
          label="Name"
          placeholder="e.g. 123 Brickell, Acme Acquisition, Our Home…"
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!name.trim() && submitted ? "Required" : undefined}
        />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="create-terminal-description"
            className="text-xs font-medium text-text-1"
          >
            Description <span className="text-text-3">(optional)</span>
          </label>
          <textarea
            id="create-terminal-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What is this space for?"
            className="rounded border border-border bg-bg-2 px-3 py-2 text-sm text-text-0 placeholder:text-text-3 focus:border-border-focus focus:outline-none"
          />
          <FieldHint>Optional — describe the goal or scope.</FieldHint>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" loading={loading}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
