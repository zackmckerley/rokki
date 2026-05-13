/**
 * Files module manifest.
 *
 * Phase 0 stub. Files is the biggest new build in Phase 1: standalone
 * module surfaces at space and terminal scope, with upload UI, folder
 * tree, search, and Azure Blob integration per `docs/05_FILES.md`.
 *
 * No user-scope view in v1 — a cross-space file rollup is a future
 * conversation.
 */
import type { ModuleManifest } from "@rokki/sdk";

export const filesManifest: ModuleManifest = {
  slug: "files",
  name: "Files",
  description: "Upload, organize, and find documents and assets.",
  icon: "folder",
  scopes: ["space", "terminal"],
  routes: {
    space: "/s/[slug]/files",
    terminal: "/p/[ticker]/files",
  },
  fnKey: { label: "Files", default: 3 },
};
