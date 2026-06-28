/**
 * Module registration entry point.
 *
 * Importing this file registers every v1 module's manifest with the
 * in-process registry. Server-side: import once at app boot (root
 * layout or instrumentation). Client-side: not needed — the pane
 * shell server-renders module lists from the DB and serializes them
 * down.
 *
 * Adding a module: create `<slug>/manifest.ts`, then add the import
 * + `registerModule(...)` call here. Also add the slug to the
 * `modules_catalog` seed in the next migration.
 */
import { registerModule } from "@rokki/sdk";
import { tasksManifest } from "./tasks/manifest";
import { filesManifest } from "./files/manifest";
import { messengerManifest } from "./messenger/manifest";
import { scheduleManifest } from "./schedule/manifest";
import { goalsManifest } from "./goals/manifest";
import { marketsManifest } from "./markets/manifest";
import { contactsManifest } from "./contacts/manifest";

let registered = false;

/**
 * Register every v1 module manifest. Idempotent — safe to call
 * repeatedly (the registry rejects duplicate registrations with a
 * different object, but identity match is a no-op).
 */
export function registerAllModules(): void {
  if (registered) return;
  registerModule(tasksManifest);
  registerModule(filesManifest);
  registerModule(messengerManifest);
  registerModule(scheduleManifest);
  registerModule(goalsManifest);
  registerModule(marketsManifest);
  registerModule(contactsManifest);
  registered = true;
}

// Auto-register on module load. The function above stays exported
// for tests that want explicit control.
registerAllModules();
