"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "./Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { FormError } from "./ui/FormError";

interface CreateOrgDialogProps {
  open: boolean;
  onClose: () => void;
}

function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function CreateOrgDialog({ open, onClose }: CreateOrgDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** Have we tried to submit yet? Drives "Required" hints on the inputs
   * — silent until the user actually attempts the action. */
  const [submitted, setSubmitted] = useState(false);

  function handleNameChange(v: string) {
    setName(v);
    if (!slugDirty) setSlug(suggestSlug(v));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !slug.trim()) {
      // Inline "Required" markers do the talking; no need for a banner too.
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/v1/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
    });
    const body = (await res.json()) as {
      errors?: { message: string }[];
    };
    if (!res.ok) {
      setError(body.errors?.[0]?.message ?? "Failed to create space");
      setLoading(false);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create space">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <FormError message={error} />
        <Input
          name="name"
          label="Name"
          placeholder="HELIOS"
          autoFocus
          required
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          error={!name.trim() && submitted ? "Required" : undefined}
        />
        <Input
          name="slug"
          label="Slug"
          monospace
          hint="Lowercase letters, digits, hyphens. Used in URLs."
          placeholder="helios"
          required
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugDirty(true);
          }}
          error={!slug.trim() && submitted ? "Required" : undefined}
        />
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
