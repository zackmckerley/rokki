/**
 * Content-sniffing helpers — never trust a client-supplied Content-Type for
 * anything that will later be served back to a browser. We derive the real type
 * from the file's magic bytes. Text-based "images" like SVG have no magic bytes
 * and return null, so they're rejected (they're the stored-XSS vector).
 */

/** Real raster-image MIME from magic bytes, or null if it isn't one. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 12) return null;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return "image/png";
  }
  // GIF: 47 49 46 38 ("GIF8")
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return "image/gif";
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  // BMP: "BM"
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  // HEIC/HEIF: ISO-BMFF "ftyp" box (offset 4) with a heic/heif-family brand.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (["heic", "heix", "hevc", "heif", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

/** Content types that browsers will execute/render inline — never serve these
 *  inline from user uploads. Used to force a download disposition. */
export function isActiveContentType(type: string | null | undefined): boolean {
  const t = (type ?? "").toLowerCase();
  return (
    t.includes("html") ||
    t.includes("svg") ||
    t.includes("xml") ||
    t.includes("javascript") ||
    t.includes("ecmascript")
  );
}
