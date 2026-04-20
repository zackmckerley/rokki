import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { VendorsClient, type VendorRow } from "./VendorsClient";

export const metadata = { title: "Vendors — Rokki" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function VendorsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug, name")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!space) notFound();
  const s = space as { id: string; slug: string; name: string };

  const { data: vendors } = await supabase
    .from("vendors")
    .select(
      "id, name, contact_name, contact_email, contact_phone, website, tags, notes, created_at",
    )
    .eq("space_id", s.id)
    .order("name", { ascending: true });

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          Dashboard
        </Link>
        <span className="text-text-3">/</span>
        <span className="text-text-1">{s.name}</span>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Vendors</span>
      </TopBar>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <header className="mb-4">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-text-0">
            <Briefcase className="h-5 w-5 text-accent" />
            Vendors — {s.name}
          </h1>
          <p className="mt-1 text-xs text-text-3">
            Shared directory of vendors, contractors, and consultants for this
            space.
          </p>
        </header>
        <VendorsClient
          slug={s.slug}
          initial={(vendors ?? []) as VendorRow[]}
        />
      </main>
    </div>
  );
}
