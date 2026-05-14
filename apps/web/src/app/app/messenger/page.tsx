import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * `/app/messenger` — Phase 1 redirect to the existing `/messages`
 * inbox. Same approach as `/app/schedule`: the existing page is
 * the right surface and re-skinning it in the pane shell is a
 * follow-up rather than a Phase 1 must-have.
 */
export default async function AppMessengerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  redirect("/messages");
}
