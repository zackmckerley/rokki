/**
 * Pure helpers for contact avatar uploads — kept DOM/IO-free so the storage
 * route stays thin and these rules are unit-tested. See
 * `app/api/v1/contacts/avatar/route.ts` and the `contact-avatars` bucket
 * (20260628150000_contacts_profile_expand.sql).
 */

export const AVATAR_BUCKET = "contact-avatars";

/** Hard ceiling for an avatar upload. Profile pictures are small; this is a
 *  guardrail against someone POSTing a huge file, not a real constraint. */
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** Image MIME → file extension. Returns null for anything we won't accept, so
 *  the route can reject non-images up front. */
export function imageExtFromType(contentType: string | null | undefined): string | null {
  switch ((contentType ?? "").split(";")[0].trim().toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return null;
  }
}

/** Storage key for a user's avatar upload: `<userId>/<uuid>.<ext>`. The leading
 *  user-id segment is what the bucket's owner-only write RLS pins against, so it
 *  must be exactly `auth.uid()`. */
export function avatarStorageKey(userId: string, uuid: string, ext: string): string {
  return `${userId}/${uuid}.${ext}`;
}
