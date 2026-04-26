/**
 * Twitter card. Identical visual to the Open Graph image — Twitter only
 * cares about a 1200x630 PNG with the `summary_large_image` card type, so
 * we keep one source of truth and re-export.
 */
export { runtime, alt, size, contentType, default } from "./opengraph-image";
