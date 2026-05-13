import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { ScopedFileList } from "@/components/modules/ScopedFileList";
import { loadFilesForSpace } from "@/lib/modules/files-queries";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * `/s/[slug]/files` — space-scope files aggregate (read-only MVP).
 */
export default async function SpaceFilesPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: spaceRow } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  const space = spaceRow as { id: string; name: string } | null;
  if (!space) redirect("/");

  const files = await loadFilesForSpace(supabase, space.id);

  return (
    <ScopedModuleShell
      scopeKind="space"
      scopeKey={slug}
      activeSlug="files"
      flagOffBehavior="render"
    >
      <ScopedFileList files={files} title={`Files · ${space.name}`} />
    </ScopedModuleShell>
  );
}
