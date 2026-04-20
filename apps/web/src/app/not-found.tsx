import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <Wordmark size="lg" />
      <div className="text-center">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-1 text-xl font-semibold text-text-0">Not found</h1>
        <p className="mt-1 text-sm text-text-2">
          The page you&apos;re looking for doesn&apos;t exist or isn&apos;t visible to you.
        </p>
      </div>
      <Link
        href="/"
        className="rounded border border-border bg-bg-2 px-3 py-1.5 text-sm text-text-1 hover:bg-bg-3"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
