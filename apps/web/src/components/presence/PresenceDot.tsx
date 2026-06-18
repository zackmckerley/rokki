"use client";

import { cn } from "@/lib/utils";
import { useIsOnline } from "./PresenceProvider";

/**
 * Small online/offline indicator for a Rokki user: a filled green dot when the
 * user has Rokki open, a hollow muted dot otherwise. Safe to render outside a
 * PresenceProvider (reads as offline). Designed to overlay an avatar/icon
 * (pass an absolute-position className) or sit inline.
 */
export function PresenceDot({
  userId,
  className,
  title,
}: {
  userId?: string | null;
  className?: string;
  title?: string;
}) {
  const online = useIsOnline(userId);
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 flex-shrink-0 rounded-full",
        online ? "bg-success" : "border border-text-3/60 bg-transparent",
        className,
      )}
      title={title ?? (online ? "Online in Rokki" : "Offline")}
      aria-label={online ? "online" : "offline"}
    />
  );
}

/** Inline "online" / "offline" text for a Rokki user (e.g. a thread header). */
export function PresenceLabel({
  userId,
  className,
}: {
  userId?: string | null;
  className?: string;
}) {
  const online = useIsOnline(userId);
  return (
    <span
      className={cn(
        "text-[10px]",
        online ? "text-success" : "text-text-3",
        className,
      )}
    >
      {online ? "online" : "offline"}
    </span>
  );
}
