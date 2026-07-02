/**
 * Guard against open-redirects: only allow a redirect target that is a
 * same-origin ABSOLUTE PATH. Everything else (absolute URLs, protocol-relative
 * `//host`, backslash tricks `/\host`, encoded-slash `/%2f`, control chars)
 * falls back to `fallback`. Used by the login form and every auth-callback
 * redirect so an attacker can't send a freshly-authenticated user off-site.
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  // Must be an absolute path on this origin.
  if (raw[0] !== "/") return fallback;
  // Reject protocol-relative ("//host") and backslash-relative ("/\host").
  if (raw[1] === "/" || raw[1] === "\\") return fallback;
  // A stray backslash anywhere can be normalized to "/" by browsers.
  if (raw.includes("\\")) return fallback;
  // Encoded slash/backslash right after the leading slash → still off-origin.
  const lower = raw.toLowerCase();
  if (lower.startsWith("/%2f") || lower.startsWith("/%5c")) return fallback;
  // Reject control characters / newlines (header-splitting, normalization).
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  return raw;
}
