/**
 * Pure helpers for lead file attachments — kept DOM/IO-free so the storage
 * route stays thin. The bucket holds bytes; file metadata lives on the lead in
 * `attributes.files` as `LeadFile[]`.
 */

export const LEAD_FILES_BUCKET = "lead-files";
export const LEAD_FILE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB (matches the bucket)

export interface LeadFile {
  key: string;
  name: string;
  size: number;
  type: string;
  uploaded_at: string;
}

/** Lowercase extension from a filename, or "bin" when there isn't one. */
export function extFromName(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "bin";
}

/** Storage key: `<userId>/<leadId>/<uuid>.<ext>`. The leading user-id segment is
 *  what the bucket's owner-only policies pin against, so it must be auth.uid(). */
export function leadFileKey(
  userId: string,
  leadId: string,
  uuid: string,
  ext: string,
): string {
  return `${userId}/${leadId}/${uuid}.${ext}`;
}
