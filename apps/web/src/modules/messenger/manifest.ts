/**
 * Messenger module manifest.
 *
 * Phase 0 stub. Phase 1 wraps the existing `apps/web/src/modules/messages/`
 * page at `/modules/messenger`, adds a space-scope view that shows channels
 * per space, and a terminal-scope view that surfaces one thread per
 * terminal.
 */
import type { ModuleManifest } from "@rokki/sdk";

export const messengerManifest: ModuleManifest = {
  slug: "messenger",
  name: "Messenger",
  description: "Real-time chat with threads, mentions, and reactions.",
  icon: "message-square",
  scopes: ["user", "space", "terminal"],
  routes: {
    user: "/modules/messenger",
    space: "/s/[slug]/messages",
    terminal: "/p/[ticker]/messages",
  },
};
