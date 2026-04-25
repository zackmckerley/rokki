"use client";

/**
 * App-router global error boundary. Catches anything that escapes per-
 * route error.tsx boundaries (typically root-layout render failures or
 * exceptions thrown before any route matches). Renders its own <html>
 * + <body> because at this point Next's layout chain has already failed.
 *
 * The Sentry capture is what makes the @sentry/nextjs build warning go
 * away — without a global-error.tsx, RSC render errors at the root never
 * reach Sentry.
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import NextError from "next/error";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // NextError is the framework's built-in error UI — minimal but works
  // even when the rest of the layout (fonts, tokens, components) hasn't
  // had a chance to load. We deliberately don't pull in the design
  // system here because if we're in global-error, the design system may
  // be the thing that broke.
  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
