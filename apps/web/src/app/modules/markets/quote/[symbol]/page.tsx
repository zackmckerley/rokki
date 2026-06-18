import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { QuoteView } from "@/modules/markets/components/QuoteView";
import { getQuoteCached } from "@/lib/markets/cache";
import { getProfile } from "@/lib/markets/providers";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import type { CompanyProfile, Quote } from "@/lib/markets/providers/types";

interface Props {
  params: Promise<{ symbol: string }>;
}

export default async function QuotePage({ params }: Props) {
  const { symbol: raw } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const symbol = normalizeSymbol(decodeURIComponent(raw));
  if (!isValidSymbol(symbol)) redirect("/modules/markets");

  let quote: Quote | null = null;
  let profile: CompanyProfile | null = null;
  await Promise.all([
    getQuoteCached(symbol)
      .then((r) => {
        quote = r.quote;
      })
      .catch(() => {}),
    getProfile(symbol)
      .then((p) => {
        profile = p;
      })
      .catch(() => {}),
  ]);

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="markets" flagOffBehavior="render">
      <QuoteView symbol={symbol} initialQuote={quote} profile={profile} />
    </ScopedModuleShell>
  );
}
