import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@rokki/db"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "app.rokki.ai", "staging.rokki.ai"],
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=(), payment=()",
          },
        ],
      },
    ];
  },
};

// Sentry wrapping. The plugin uploads sourcemaps to Sentry at build time
// (only when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set —
// otherwise it's a silent no-op so local builds stay fast). Browser-side
// error reporting works without these; sourcemaps just won't be uploaded.
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  // Hide the source-map uploader's spec from the public bundle URL.
  hideSourceMaps: true,
  // Disable the upload step entirely if no auth token is present —
  // otherwise next build prints noisy warnings on every dev's machine.
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
