/**
 * Deterministic contact-blob parser — turns a pasted/dropped chunk of text
 * (an email signature, an Apple/Google contact-card copy, a vCard, or just a
 * few labeled lines) into structured contact fields.
 *
 * NO LLM / network — pure regex + heuristics, so it's fast, offline, unit-tested
 * and reused by the create/edit form. When a line can't be classified with
 * confidence it goes to `unmatched` rather than being guessed into the wrong
 * field; the UI shows those for the user to place by hand.
 */
import type {
  ContactAddress,
  ContactEmail,
  ContactPhone,
  ContactSocial,
} from "./db";
import { phoneDedupeKey } from "./normalize";

export interface ParsedContact {
  prefix?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;
  nickname?: string;
  company?: string;
  title?: string;
  birthday?: string; // yyyy-mm-dd
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  socials: ContactSocial[];
  notes?: string;
  /** Lines we couldn't confidently classify — surfaced for manual placement. */
  unmatched: string[];
}

function empty(): ParsedContact {
  return { emails: [], phones: [], addresses: [], socials: [], unmatched: [] };
}

// ── token regexes ─────────────────────────────────────────────────────────
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// US/intl phone: optional +cc, area code (paren or not), 7-digit local, optional ext.
const PHONE_RE =
  /(\+?\d{1,3}[\s.\-]?)?(\(\d{3}\)|\d{3})[\s.\-]\d{3}[\s.\-]\d{4}(\s?(?:x|ext\.?|extension)\s?\d{1,6})?/gi;
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s,;]+|[a-z0-9-]+\.(?:com|net|org|io|co|me|us|biz)(?:\/[^\s,;]*)?)/gi;

// ── label vocabularies ──────────────────────────────────────────────────────
const PHONE_LABEL_WORDS: Array<[RegExp, string]> = [
  [/\b(mobile|cell(ular)?|cel|mob|iphone)\b/i, "mobile"],
  [/\b(work|office|business|direct|tel|telephone|desk)\b/i, "work"],
  [/\b(home|residence|landline)\b/i, "home"],
  [/\b(fax|facsimile)\b/i, "other"],
  [/\b(main|other)\b/i, "other"],
];
const EMAIL_LABEL_WORDS: Array<[RegExp, string]> = [
  [/\b(work|office|business)\b/i, "work"],
  [/\b(personal|home)\b/i, "personal"],
];

const CORP_RE =
  /\b(inc\.?|incorporated|llc|l\.l\.c\.?|llp|lllp|ltd\.?|limited|corp\.?|corporation|co\.|company|group|partners|capital|holdings|ventures|properties|property|realty|realtors?|associates|advisors|advisory|consulting|consultants|bank|trust|pllc|p\.?l\.?l\.?c\.?|p\.?a\.?|p\.?c\.?|management|development|builders|construction|enterprises|industries|solutions|systems|services|agency|studios?|design|media|labs?|technologies|tech)\b/i;

const TITLE_RE =
  /\b(ceo|cfo|coo|cto|cmo|cio|president|vice[- ]president|vp|svp|evp|director|managing director|manager|broker|realtor|real estate (agent|broker)|sales associate|associate broker|agent|partner|managing partner|associate|founder|co[- ]?founder|principal|owner|proprietor|attorney|lawyer|counsel|general counsel|paralegal|analyst|consultant|advisor|adviser|engineer|architect|developer|head of [a-z ]+|chief [a-z ]+ officer|chief|executive|administrator|coordinator|specialist|representative|rep|officer|supervisor|lead|account executive)\b/i;

// Known labeled-field keys, normalized.
const FIELD_KEYS: Array<[RegExp, string]> = [
  [/^(name|full name|contact)$/i, "name"],
  [/^(first ?name|given name)$/i, "first"],
  [/^(last ?name|surname|family name)$/i, "last"],
  [/^(nick ?name|goes by)$/i, "nickname"],
  [/^(company|organi[sz]ation|org|employer|business name|firm)$/i, "company"],
  [/^(title|job title|position|role)$/i, "title"],
  [/^(e[- ]?mail( address)?|mail)$/i, "email"],
  [/^(work e[- ]?mail|office e[- ]?mail)$/i, "email:work"],
  [/^(personal e[- ]?mail|home e[- ]?mail)$/i, "email:personal"],
  [/^(phone( number)?|tel(ephone)?|number|ph)$/i, "phone"],
  [/^(mobile( phone)?|cell( phone)?|cellular|mob)$/i, "phone:mobile"],
  [/^(work phone|office( phone)?|business phone|direct( line)?)$/i, "phone:work"],
  [/^(home phone|landline)$/i, "phone:home"],
  [/^(fax)$/i, "phone:other"],
  [/^(address|addr|location|mailing address|street)$/i, "address"],
  [/^(birth ?day|d\.?o\.?b\.?|date of birth|born)$/i, "birthday"],
  [/^(web( ?site)?|url|homepage|site)$/i, "website"],
  [/^(linked ?in)$/i, "linkedin"],
  [/^(insta(gram)?|ig)$/i, "instagram"],
  [/^(twitter|x)$/i, "x"],
  [/^(facebook|fb)$/i, "facebook"],
  [/^(notes?|memo|comments?)$/i, "notes"],
];

// Apple/Google "label on its own line, value on the next" copy format.
const STANDALONE_PHONE_LABEL =
  /^(mobile|cell|iphone|work|office|home|main|fax|other|business|direct)$/i;
const STANDALONE_EMAIL_LABEL = /^(work|personal|home|other|email)$/i;

const PREFIXES = new Set(["mr", "mrs", "ms", "mx", "dr", "prof", "sir", "madam", "miss"]);
const SUFFIXES = new Set([
  "jr", "sr", "ii", "iii", "iv", "v", "phd", "md", "esq", "esquire", "cpa",
  "mba", "jd", "pe", "ra", "aia", "pa", "dds", "rn",
]);

// ── small helpers ───────────────────────────────────────────────────────────
function cleanWord(s: string): string {
  return s.replace(/[.,]/g, "").trim().toLowerCase();
}

function phoneLabel(context: string): string | undefined {
  for (const [re, label] of PHONE_LABEL_WORDS) if (re.test(context)) return label;
  return undefined;
}
function emailLabel(context: string): string | undefined {
  for (const [re, label] of EMAIL_LABEL_WORDS) if (re.test(context)) return label;
  return undefined;
}

/**
 * Extract the host from a URL-ish string ("https://x.com/u", "www.x.com/u",
 * "x.com/u" → "x.com"). Returns "" when there's no host part. Matching socials
 * on the parsed host (not a substring) avoids the "fb.com anywhere in the
 * string" false-positive that a naive `.includes()` would accept.
 */
function hostOf(v: string): string {
  return v
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}
/** Host equals the domain or is a subdomain of it. */
function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

function classifySocial(raw: string): ContactSocial | null {
  const v = raw.trim().replace(/^@/, "");
  if (!v) return null;
  const host = hostOf(v);
  if (hostIs(host, "linkedin.com")) return { kind: "linkedin", value: v };
  if (hostIs(host, "instagram.com")) return { kind: "instagram", value: v };
  if (hostIs(host, "facebook.com") || hostIs(host, "fb.com"))
    return { kind: "facebook", value: v };
  if (hostIs(host, "twitter.com") || hostIs(host, "x.com"))
    return { kind: "x", value: v };
  // bare domain or http(s) → website
  if (/^(https?:\/\/|www\.)/i.test(v) || /\.[a-z]{2,}(\/|$)/i.test(v))
    return { kind: "website", value: v };
  return null;
}

/** Split a free-form full name into structured pieces. */
export function splitName(full: string): {
  prefix?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;
} {
  let s = full.trim().replace(/\s+/g, " ");
  if (!s) return {};
  // "Last, First Middle" → "First Middle Last"
  const comma = s.indexOf(",");
  if (comma > 0 && s.indexOf(",") === s.lastIndexOf(",")) {
    const before = s.slice(0, comma).trim();
    const after = s.slice(comma + 1).trim();
    // Only flip when the part after the comma isn't itself a suffix (e.g. "Bob, Jr").
    if (after && !SUFFIXES.has(cleanWord(after))) s = `${after} ${before}`;
    else s = before;
  }
  const tokens = s.split(" ").filter(Boolean);
  const out: ReturnType<typeof splitName> = {};
  // Leading prefix.
  if (tokens.length > 1 && PREFIXES.has(cleanWord(tokens[0]))) {
    out.prefix = tokens.shift()!.replace(/,$/, "");
  }
  // Trailing suffix.
  if (tokens.length > 1 && SUFFIXES.has(cleanWord(tokens[tokens.length - 1]))) {
    out.suffix = tokens.pop()!.replace(/,$/, "");
  }
  if (tokens.length === 0) return out;
  if (tokens.length === 1) {
    out.first_name = tokens[0];
    return out;
  }
  out.first_name = tokens[0];
  out.last_name = tokens[tokens.length - 1];
  if (tokens.length > 2) out.middle_name = tokens.slice(1, -1).join(" ");
  return out;
}

/** Does this residual line look like a person's name (vs a company/title)? */
function looksLikeName(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  if (/[@\d]/.test(t)) return false; // emails/phones/street numbers excluded
  if (CORP_RE.test(t)) return false;
  if (TITLE_RE.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 5) return false;
  // Mostly alphabetic words, each starting upper (allow O'Brien, Jean-Luc,
  // accents, and a trailing comma as in "Mendez, Carlos").
  return words.every((w) => {
    const c = w.replace(/,$/, "");
    return (
      /^[\p{Lu}][\p{L}'’.-]*$/u.test(c) ||
      PREFIXES.has(cleanWord(c)) ||
      SUFFIXES.has(cleanWord(c))
    );
  });
}

const US_STATE =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const CITY_STATE_ZIP_RE = new RegExp(
  `^(.+?),?\\s+(${US_STATE})\\.?\\s+(\\d{5}(?:-\\d{4})?)$`,
  "i",
);
const STREET_RE =
  /^\d+[\w.-]*\s+\w+|\b(street|st\.?|avenue|ave\.?|boulevard|blvd\.?|road|rd\.?|drive|dr\.?|lane|ln\.?|court|ct\.?|place|pl\.?|terrace|ter\.?|way|circle|cir\.?|highway|hwy\.?|suite|ste\.?|unit|apt\.?|#)\b/i;

function parseBirthday(raw: string): string | undefined {
  const s = raw.trim();
  // ISO yyyy-mm-dd
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  // mm/dd/yyyy or mm-dd-yyyy
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const yyyy = m[3].length === 2 ? `19${m[3]}` : m[3];
    return `${yyyy}-${pad(m[1])}-${pad(m[2])}`;
  }
  // "Month D, YYYY" / "D Month YYYY"
  const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
  const lower = s.toLowerCase();
  for (let i = 0; i < 12; i++) {
    if (lower.includes(months[i])) {
      const dm = /(\d{1,2})/.exec(s);
      const ym = /(\d{4})/.exec(s);
      if (dm && ym) return `${ym[1]}-${pad(String(i + 1))}-${pad(dm[1])}`;
    }
  }
  return undefined;
}
function pad(n: string | number): string {
  return String(n).padStart(2, "0");
}

// ── main entry ──────────────────────────────────────────────────────────────
export function parseContact(text: string): ParsedContact {
  if (!text || !text.trim()) return empty();
  if (/BEGIN:VCARD/i.test(text)) return parseVCard(text);
  return parsePlain(text);
}

/** Add an email if not already present (case-insensitive). */
function pushEmail(out: ParsedContact, email: string, label?: string) {
  const norm = email.trim();
  if (!norm) return;
  if (out.emails.some((e) => e.email.toLowerCase() === norm.toLowerCase())) return;
  out.emails.push(label ? { email: norm, label } : { email: norm });
}
function pushPhone(out: ParsedContact, phone: string, label?: string) {
  const norm = phone.trim();
  if (!norm) return;
  if (norm.replace(/\D/g, "").length < 7) return;
  const key = phoneDedupeKey(norm);
  if (out.phones.some((p) => phoneDedupeKey(p.phone) === key)) return;
  out.phones.push(label ? { phone: norm, label } : { phone: norm });
}
function pushSocial(out: ParsedContact, social: ContactSocial | null) {
  if (!social) return;
  if (out.socials.some((s) => s.value.toLowerCase() === social.value.toLowerCase()))
    return;
  out.socials.push(social);
}

function parsePlain(text: string): ParsedContact {
  const out = empty();
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const nameCandidates: string[] = [];
  const residual: string[] = []; // lines that may hold company / title / address
  let pendingPhoneLabel: string | undefined;
  let pendingEmailLabel: string | undefined;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Apple-style "label on its own line", value follows. A bare label like
    // "work" can apply to either the next phone OR the next email, so set both
    // pending hints and let the value's type pick the right one.
    if (
      !/[@\d]/.test(line) &&
      line.length <= 12 &&
      (STANDALONE_PHONE_LABEL.test(line) || STANDALONE_EMAIL_LABEL.test(line))
    ) {
      pendingPhoneLabel = phoneLabel(line);
      pendingEmailLabel = emailLabel(line);
      continue;
    }

    // Labeled "Key: value".
    const kv = /^([A-Za-z][A-Za-z /]{1,28}?)\s*[:\t]\s*(.+)$/.exec(line);
    let key: string | null = null;
    let value = line;
    if (kv) {
      const normKey = resolveKey(kv[1].trim());
      if (normKey) {
        key = normKey;
        value = kv[2].trim();
      }
    }

    // Pull tokens out of the value (or whole line).
    const emails = value.match(EMAIL_RE) ?? [];
    const phones = value.match(PHONE_RE) ?? [];
    let residualText = value;
    for (const e of emails) residualText = residualText.replace(e, " ");
    for (const p of phones) residualText = residualText.replace(p, " ");

    // URLs / socials (run before residual classification so a bare domain
    // doesn't get mistaken for a company name).
    const urls = residualText.match(URL_RE) ?? [];
    for (const u of urls) {
      residualText = residualText.replace(u, " ");
      pushSocial(out, classifySocial(u));
    }
    residualText = residualText.replace(/\s{2,}/g, " ").trim();

    // Assign emails/phones with the best available label.
    const lineLabelCtx = key ? key : line;
    for (const e of emails) {
      const lbl =
        key && key.startsWith("email:")
          ? key.slice(6)
          : emailLabel(lineLabelCtx) ?? pendingEmailLabel;
      pushEmail(out, e, lbl);
    }
    for (const p of phones) {
      const lbl =
        key && key.startsWith("phone:")
          ? key.slice(6)
          : phoneLabel(lineLabelCtx) ?? pendingPhoneLabel;
      pushPhone(out, p, lbl);
    }
    // A standalone label hint applies to the very next value only — clear both
    // once any token on this line has consumed them.
    if (emails.length || phones.length) {
      pendingEmailLabel = undefined;
      pendingPhoneLabel = undefined;
    }

    // Explicit non-token fields.
    if (key && !key.startsWith("email") && !key.startsWith("phone")) {
      applyKeyed(out, key, residualText || value, nameCandidates);
      continue;
    }

    if (!residualText) continue;

    // City/State/ZIP → close out an address.
    const csz = CITY_STATE_ZIP_RE.exec(residualText);
    if (csz) {
      const addr: ContactAddress =
        out.addresses[out.addresses.length - 1] &&
        !out.addresses[out.addresses.length - 1].city
          ? out.addresses[out.addresses.length - 1]
          : (() => {
              const a: ContactAddress = {};
              out.addresses.push(a);
              return a;
            })();
      addr.city = csz[1].trim();
      addr.state = csz[2].toUpperCase();
      addr.postal = csz[3];
      continue;
    }
    // Street line → start an address.
    if (STREET_RE.test(residualText)) {
      out.addresses.push({ line1: residualText });
      continue;
    }

    if (looksLikeName(residualText)) nameCandidates.push(residualText);
    else residual.push(residualText);
  }

  // ── name ──────────────────────────────────────────────────────────────────
  if (!out.first_name && !out.last_name) {
    const chosen = nameCandidates[0];
    if (chosen) {
      Object.assign(out, stripUndef(splitName(chosen)));
      nameCandidates.shift();
    }
  }
  // Any extra name-like lines that weren't the chosen name are likely noise
  // (a duplicate or a colleague) — keep them visible.
  out.unmatched.push(...nameCandidates);

  // ── company / title from residual lines ────────────────────────────────────
  for (const line of residual) {
    if (!out.company && CORP_RE.test(line)) {
      const split = splitTitleCompany(line);
      if (split.title && !out.title) out.title = split.title;
      out.company = split.company;
    } else if (!out.title && TITLE_RE.test(line)) {
      const split = splitTitleCompany(line);
      out.title = split.title ?? line;
      if (split.company && !out.company) out.company = split.company;
    } else {
      out.unmatched.push(line);
    }
  }

  return out;
}

/** "VP of Sales, Acme Realty" / "VP of Sales | Acme Realty" → {title, company}. */
function splitTitleCompany(line: string): { title?: string; company?: string } {
  const parts = line.split(/\s*[,|·•–—]\s*/).filter(Boolean);
  if (parts.length >= 2) {
    const titlePart = parts.find((p) => TITLE_RE.test(p));
    const companyPart = parts.find((p) => CORP_RE.test(p)) ?? parts.find((p) => p !== titlePart);
    return {
      title: titlePart?.trim(),
      company: companyPart && companyPart !== titlePart ? companyPart.trim() : undefined,
    };
  }
  if (CORP_RE.test(line)) return { company: line.trim() };
  if (TITLE_RE.test(line)) return { title: line.trim() };
  return {};
}

function resolveKey(raw: string): string | null {
  const k = raw.trim();
  for (const [re, norm] of FIELD_KEYS) if (re.test(k)) return norm;
  return null;
}

function applyKeyed(
  out: ParsedContact,
  key: string,
  value: string,
  nameCandidates: string[],
) {
  const v = value.trim();
  if (!v) return;
  switch (key) {
    case "name":
      if (!out.first_name && !out.last_name) {
        Object.assign(out, stripUndef(splitName(v)));
      } else nameCandidates.push(v);
      break;
    case "first":
      out.first_name = v;
      break;
    case "last":
      out.last_name = v;
      break;
    case "nickname":
      out.nickname = v;
      break;
    case "company":
      out.company = v;
      break;
    case "title":
      out.title = v;
      break;
    case "address":
      if (STREET_RE.test(v) || /\d/.test(v)) out.addresses.push({ line1: v });
      else out.unmatched.push(v);
      break;
    case "birthday": {
      const bday = parseBirthday(v);
      if (bday) out.birthday = bday;
      else out.unmatched.push(value);
      break;
    }
    case "website":
      pushSocial(out, { kind: "website", value: v });
      break;
    case "linkedin":
      pushSocial(out, { kind: "linkedin", value: v });
      break;
    case "instagram":
      pushSocial(out, { kind: "instagram", value: v.replace(/^@/, "") });
      break;
    case "x":
      pushSocial(out, { kind: "x", value: v.replace(/^@/, "") });
      break;
    case "facebook":
      pushSocial(out, { kind: "facebook", value: v });
      break;
    case "notes":
      out.notes = out.notes ? `${out.notes}\n${v}` : v;
      break;
    default:
      out.unmatched.push(value);
  }
}

function stripUndef<T extends Record<string, unknown>>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const k in o) if (o[k] !== undefined && o[k] !== "") r[k] = o[k];
  return r;
}

// ── vCard ───────────────────────────────────────────────────────────────────
function parseVCard(text: string): ParsedContact {
  const out = empty();
  // Unfold continued lines (RFC 6350: a leading space/tab continues the prior).
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  for (const rawLine of unfolded.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(BEGIN|END|VERSION):/i.test(line)) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const spec = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    const [name, ...paramParts] = spec.split(";");
    const params = paramParts.join(";").toLowerCase();
    const upper = name.toUpperCase();

    switch (upper) {
      case "N": {
        // N:Last;First;Middle;Prefix;Suffix
        const [last, first, middle, prefix, suffix] = value.split(";");
        if (first) out.first_name = vunesc(first);
        if (last) out.last_name = vunesc(last);
        if (middle) out.middle_name = vunesc(middle);
        if (prefix) out.prefix = vunesc(prefix);
        if (suffix) out.suffix = vunesc(suffix);
        break;
      }
      case "FN":
        if (!out.first_name && !out.last_name)
          Object.assign(out, stripUndef(splitName(vunesc(value))));
        break;
      case "NICKNAME":
        out.nickname = vunesc(value);
        break;
      case "ORG":
        out.company = vunesc(value.split(";")[0]);
        break;
      case "TITLE":
        out.title = vunesc(value);
        break;
      case "EMAIL":
        pushEmail(out, vunesc(value), vcardLabel(params, EMAIL_LABEL_WORDS));
        break;
      case "TEL":
        pushPhone(out, vunesc(value), vcardLabel(params, PHONE_LABEL_WORDS));
        break;
      case "BDAY": {
        const bday = parseBirthday(value);
        if (bday) out.birthday = bday;
        break;
      }
      case "URL":
        pushSocial(out, classifySocial(value) ?? { kind: "website", value });
        break;
      case "ADR": {
        // ADR:;;street;city;state;postal;country
        const parts = value.split(";").map(vunesc);
        const addr: ContactAddress = {};
        if (parts[2]) addr.line1 = parts[2];
        if (parts[3]) addr.city = parts[3];
        if (parts[4]) addr.state = parts[4];
        if (parts[5]) addr.postal = parts[5];
        if (parts[6]) addr.country = parts[6];
        const label = /home/.test(params) ? "home" : /work/.test(params) ? "business" : undefined;
        if (label) addr.label = label;
        if (Object.keys(addr).length) out.addresses.push(addr);
        break;
      }
      case "NOTE":
        out.notes = vunesc(value);
        break;
      default:
        break;
    }
  }
  return out;
}

function vunesc(s: string): string {
  return s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}
function vcardLabel(params: string, words: Array<[RegExp, string]>): string | undefined {
  for (const [re, label] of words) if (re.test(params)) return label;
  return undefined;
}
