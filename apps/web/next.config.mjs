import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Bundle analyzer wrap. Activates when `ANALYZE=true` is set on the
// build (e.g. `pnpm bundle:check`) — emits HTML reports under
// `.next/analyze/` and writes machine-readable JSON the budget
// checker reads. Off by default so production builds aren't slowed.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

// Resolve apps/web absolutely so the @/* alias works regardless of the
// CWD next is launched from. Vercel was failing to resolve `@/lib/*`
// even though the tsconfig paths were correct — registering the alias
// explicitly with webpack bypasses whatever auto-detection breaks
// there.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@rokki/db"],
  async redirects() {
    return [
      // Module landing routes moved from `/app/*` to `/modules/*` (2026-06-16)
      // so the URL namespace matches the product term ("modules"). Keep the
      // old paths working with a permanent (308) redirect for any cached
      // links, bookmarks, or external references.
      { source: "/app/:path*", destination: "/modules/:path*", permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "app.rokki.ai", "staging.rokki.ai"],
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname, "src"),
    };
    return config;
  },
  // Security headers are centralised in apps/web/src/lib/security-headers.ts
  // and applied by the middleware. Keeping them in one place avoids the
  // double-source-of-truth problem where next.config.mjs and middleware
  // can drift apart silently.
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

export default withSentryConfig(withBundleAnalyzer(nextConfig), sentryBuildOptions);
