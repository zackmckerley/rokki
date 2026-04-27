/**
 * Username allow-list — the source of truth for short usernames that map
 * to pseudo-emails for the password-login flow.
 *
 * Two consumers:
 *   1. /api/v1/auth/password-login — translates username → email before
 *      calling supabase.auth.signInWithPassword.
 *   2. /admin/users/[userId] — reverse-lookup to display the username
 *      next to the user's full name + email.
 *
 * Why so narrow? Magic-link email is the primary flow. This list only
 * exists so a platform admin can sign in without an inbox (local dev,
 * emergency prod access). Adding usernames is intentionally a code
 * change, not an admin-UI action — fewer accounts, less surface area.
 */

const USERNAME_MAP = {
  admin: "admin@rokki.local",
} as const satisfies Record<string, string>;

export type Username = keyof typeof USERNAME_MAP;

/**
 * Look up the pseudo-email for a username. Returns `undefined` if the
 * username is not in the allow-list — callers should treat that as a
 * 403, never as a 404, to avoid leaking which usernames exist.
 */
export function getEmailForUsername(username: string): string | undefined {
  const key = username.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(USERNAME_MAP, key)) return undefined;
  return USERNAME_MAP[key as Username];
}

/**
 * Reverse lookup: given an email, return the username that maps to it.
 * Returns `null` when the email isn't in the allow-list. Match is
 * case-insensitive on both sides since Supabase normalizes emails to
 * lowercase but admins might paste a mixed-case value.
 */
export function getUsernameForEmail(email: string): string | null {
  if (!email) return null;
  const target = email.trim().toLowerCase();
  for (const [username, mapped] of Object.entries(USERNAME_MAP)) {
    if (mapped.toLowerCase() === target) return username;
  }
  return null;
}

/**
 * All usernames currently allow-listed. Useful for tests and for the
 * admin-users list table when surfacing the column.
 */
export function listUsernames(): readonly Username[] {
  return Object.keys(USERNAME_MAP) as Username[];
}
