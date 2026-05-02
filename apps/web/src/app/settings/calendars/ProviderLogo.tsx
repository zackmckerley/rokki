/**
 * Tiny brand-colored provider tiles for the calendars list. Inline
 * SVG paths use the official Google + Microsoft brand glyphs at a
 * scaled-down 16px footprint so connection rows stay dense.
 *
 * Trademark note: both marks are used here only to identify the
 * destination service in a UI affordance (a connect button), which is
 * the canonical fair-use case for both Google's and Microsoft's brand
 * guidelines. No endorsement is implied.
 */

export function ProviderLogo({
  provider,
  size = 16,
  className,
}: {
  provider: "google" | "microsoft";
  size?: number;
  className?: string;
}) {
  if (provider === "google") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Google"
        role="img"
        className={className}
      >
        <path
          d="M22.501 12.232c0-.815-.073-1.6-.21-2.354H12v4.448h5.892a5.04 5.04 0 0 1-2.184 3.305v2.745h3.532c2.07-1.907 3.261-4.713 3.261-8.144Z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.94 0 5.404-.974 7.205-2.624l-3.532-2.745c-.978.654-2.231 1.04-3.673 1.04-2.823 0-5.214-1.906-6.067-4.467H2.295v2.83A10.998 10.998 0 0 0 12 23Z"
          fill="#34A853"
        />
        <path
          d="M5.933 14.204A6.612 6.612 0 0 1 5.585 12c0-.766.132-1.51.348-2.204V6.966H2.295a11 11 0 0 0 0 10.068l3.638-2.83Z"
          fill="#FBBC04"
        />
        <path
          d="M12 5.329c1.595 0 3.027.55 4.155 1.624l3.116-3.116C17.4 2.057 14.94 1 12 1 7.7 1 3.987 3.467 2.295 6.966l3.638 2.83C6.786 7.235 9.177 5.33 12 5.33Z"
          fill="#EA4335"
        />
      </svg>
    );
  }
  // Microsoft Outlook — simplified four-square mark in Microsoft blue.
  // Real Outlook icon is more elaborate; this reads at 16px and matches
  // the visual weight of the Google G.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Microsoft Outlook"
      role="img"
      className={className}
    >
      <rect x="2" y="2" width="9" height="9" fill="#F25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
      <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
      <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
