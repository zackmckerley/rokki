/**
 * Mention handling. We use a stable machine-parseable form in storage so
 * renames don't rot the reference:
 *
 *     @[Display Name](user:<uuid>)
 *
 * That's invisible to the user when the comment is being edited: the
 * front-end composer shows a pill for each mention, and on save we
 * serialize it to this form. When rendering, we convert back to pills or
 * fall back to "@Display Name" when the user can't be resolved.
 */

const MENTION_RE = /@\[([^\]]+)\]\(user:([0-9a-fA-F-]{36})\)/g;

export interface MentionRef {
  /** Byte offset in the source string. */
  start: number;
  end: number;
  userId: string;
  displayName: string;
}

/** Extract all mentions, in order of appearance. */
export function extractMentions(body: string): MentionRef[] {
  const out: MentionRef[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index == null) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      displayName: m[1],
      userId: m[2],
    });
  }
  return out;
}

/** Unique user ids referenced in the body. */
export function mentionedUserIds(body: string): string[] {
  const seen = new Set<string>();
  for (const ref of extractMentions(body)) seen.add(ref.userId);
  return Array.from(seen);
}

/**
 * Server-side render to plain text (e.g. for emails). Turns the stored
 * `@[Name](user:uuid)` form into just `@Name`.
 */
export function renderMentionsAsText(body: string): string {
  return body.replace(MENTION_RE, (_full, name: string) => `@${name}`);
}
