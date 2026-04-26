/**
 * PII redaction — used in observability pipelines (Sentry, Axiom)
 * and in admin exports.
 *
 *   redactPII(value, allowlist?)
 *     Walks objects/arrays recursively. Any property whose KEY matches
 *     the SENSITIVE_KEY pattern has its value replaced with '[redacted]'.
 *     The optional `allowlist` exempts specific key names case-insensitively.
 *
 *   redactString(s)
 *     Masks email-, phone-, and IP-shaped substrings inside a free-form
 *     string. Useful for log messages where sensitive data is interpolated
 *     into a sentence rather than carried in a structured field.
 *
 * Both functions are intentionally conservative: false positives are
 * preferred to false negatives. If a caller needs raw values
 * (legitimate admin export, debugging a specific user), they pass the
 * key through `allowlist`.
 */

const SENSITIVE_KEY = /email|phone|password|token|secret|address|ssn|ip/i;
const REDACTED = "[redacted]";

export type Redactable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Redactable[]
  | { [key: string]: Redactable };

/**
 * Recursively walk a value and replace sensitive property values with
 * '[redacted]'. The replacement always happens at the value level — keys
 * themselves are preserved so consumers can still see the shape.
 *
 * Strings outside sensitive keys are still passed through `redactString`
 * so an inline email/phone in a log message gets masked.
 */
export function redactPII(value: unknown, allowlist?: string[]): unknown {
  const allow = new Set((allowlist ?? []).map((k) => k.toLowerCase()));
  return walk(value, allow, /* parentSensitive */ false, /* parentAllowlisted */ false);
}

function walk(
  value: unknown,
  allow: Set<string>,
  parentSensitive: boolean,
  parentAllowlisted: boolean,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (parentSensitive) return REDACTED;
    if (parentAllowlisted) return value; // explicit opt-out — leave raw
    return redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return parentSensitive ? REDACTED : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, allow, parentSensitive, parentAllowlisted));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      const allowlisted = allow.has(lower);
      const sensitive = SENSITIVE_KEY.test(k) && !allowlisted;
      out[k] = walk(v, allow, sensitive, allowlisted);
    }
    return out;
  }
  return value;
}

/**
 * Mask anything in a free-form string that looks like an email, phone
 * number, or IP address. Designed to be cheap and run on every log
 * message — order of operations matters (IPs before phones, since an
 * IPv4 and a 12-digit phone can look similar).
 */
export function redactString(s: string): string {
  if (!s) return s;
  let out = s;
  out = out.replace(EMAIL_RE, maskEmail);
  out = out.replace(IPV6_RE, "[redacted-ip]");
  out = out.replace(IPV4_RE, "[redacted-ip]");
  out = out.replace(PHONE_RE, "[redacted-phone]");
  return out;
}

// Loose RFC-5322-ish — good enough for masking, not validation.
const EMAIL_RE =
  /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

// IPv4 with word boundaries so we don't mangle CIDR-prefixes inside
// hostnames or version strings.
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// IPv6 — covers both fully-expanded (8 groups separated by ':') and
// the common compressed forms with '::'. Order in the alternation
// matters: the compressed form is matched first so that something like
// `2001:db8::1` doesn't get clipped after the first colon group.
const IPV6_RE =
  /\b[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6}::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?|::[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6}|\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b::1\b/g;

// Phone: matches +CC then 7-15 digits with optional spaces/dashes/parens,
// or a bare 10-15 digit run with separators. Conservative — short
// numbers are skipped to avoid mangling order IDs.
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;

function maskEmail(_match: string, local: string, domain: string): string {
  const maskedLocal = mask(local);
  const maskedDomain = domain
    .split(".")
    .map((part, i, arr) => (i === arr.length - 1 ? part : mask(part)))
    .join(".");
  return `${maskedLocal}@${maskedDomain}`;
}

function mask(s: string): string {
  if (s.length <= 2) return s[0] + "*";
  return s[0] + "*".repeat(s.length - 2) + s[s.length - 1];
}
