/**
 * Canonical folder-path helpers. Paths:
 *   - Start with "/"
 *   - No trailing slash (except root "/")
 *   - No consecutive slashes
 *   - Each segment is 1–60 chars; allowed: letters, digits, space, underscore, dash, dot
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

/**
 * Breadcrumb segments. `/foo/bar` → [{name:"/", path:"/"}, {name:"foo", path:"/foo"}, {name:"bar", path:"/foo/bar"}]
 */
export function breadcrumbOf(path: string): { name: string; path: string }[] {
  const p = normalizePath(path);
  if (p === "/") return [{ name: "Files", path: "/" }];
  const parts = p.split("/").filter(Boolean);
  const out = [{ name: "Files", path: "/" }];
  let acc = "";
  for (const seg of parts) {
    acc += `/${seg}`;
    out.push({ name: seg, path: acc });
  }
  return out;
}
