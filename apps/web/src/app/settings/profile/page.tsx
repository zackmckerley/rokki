import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = (data as {
    full_name: string | null;
    avatar_url: string | null;
    timezone: string | null;
  } | null) ?? { full_name: null, avatar_url: null, timezone: null };

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/settings" className="text-text-3 hover:text-text-1">
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Profile</span>
      </TopBar>
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="mb-1 text-xl font-semibold text-text-0">Profile</h1>
        <p className="mb-6 text-xs text-text-3">
          How you appear to teammates.
        </p>
        <ProfileForm
          email={user.email ?? ""}
          initial={profile}
        />
      </main>
    </div>
  );
}
