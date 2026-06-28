import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { ContactsView } from "@/modules/contacts/components/ContactsView";
import { loadContacts } from "@/modules/contacts/lib/server-data";

export const metadata = { title: "Contacts — Rokki" };

export default async function ContactsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const contacts = await loadContacts(supabase, user.id);

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="contacts" flagOffBehavior="render">
      <ContactsView initialContacts={contacts} />
    </ScopedModuleShell>
  );
}
