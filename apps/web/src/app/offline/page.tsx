import type { Metadata } from "next";
import { OfflineStatus } from "./OfflineStatus";

export const metadata: Metadata = {
  title: "Offline · Rokki",
  description: "You are offline. Cached pages and queued changes shown.",
  robots: { index: false, follow: false },
};

/**
 * Static fallback page. Pre-rendered at build so the service worker can
 * return it from cache when a user navigates to a page that isn't cached
 * AND the network is down. Client component handles the dynamic bits
 * (queue listing, online detection).
 */
export const dynamic = "force-static";

export default function OfflinePage() {
  return <OfflineStatus />;
}
