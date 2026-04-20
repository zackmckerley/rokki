/**
 * Mirror of apps/web/src/lib/folder-path.ts. Kept in-package to avoid
 * creating a shared module dependency for the MCP server. If you change
 * validation rules here, change them in the web app too.
 */

const SEGMENT_RE = /^[\p{L}\p{N} _.\-&()]+$/u;

export function isValidFolderName(name: string): boolean {
  return (
    name.length >= 1 &&
    name.length <= 60 &&
    SEGMENT_RE.test(name) &&
    !name.includes("/")
  );
}

export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  const trimmed = path.replace(/\/+$/g, "").replace(/\/{2,}/g, "/");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function joinPath(parent: string, name: string): string {
  const p = normalizePath(parent);
  if (p === "/") return `/${name}`;
  return `${p}/${name}`;
}

export function parentOf(path: string): string {
  const p = normalizePath(path);
  if (p === "/") return "/";
  const idx = p.lastIndexOf("/");
  return idx <= 0 ? "/" : p.slice(0, idx);
}

export function basenameOf(path: string): string {
  const p = normalizePath(path);
  if (p === "/") return "";
  return p.slice(p.lastIndexOf("/") + 1);
}
