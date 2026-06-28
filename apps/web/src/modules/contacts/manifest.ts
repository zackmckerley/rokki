/**
 * Contacts module manifest.
 *
 * Your personal relationship layer — people, firms, and the contact
 * details / interaction history behind every deal. Contacts are
 * owner-scoped (RLS `owner_id = auth.uid()`), so the module lives at the
 * **user** scope only; the Pipeline and Terminal modules *link* to these
 * records (pl_lead_contacts / terminal_contacts) rather than copying them.
 *
 * Registered in `modules/index.ts`; catalog row seeded in
 * `20260628140000_contacts_catalog.sql`. See
 * Claude/CONTACTS_PIPELINE_BUILD_PLAN.md.
 */
import type { ModuleManifest } from "@rokki/sdk";

export const contactsManifest: ModuleManifest = {
  slug: "contacts",
  name: "Contacts",
  description:
    "Your relationship layer — people, firms, contact details, and interaction history.",
  icon: "contact",
  scopes: ["user"],
  vertical: null,
  routes: {
    user: "/modules/contacts",
  },
  fnKey: { label: "Contacts", default: 7 },
};
