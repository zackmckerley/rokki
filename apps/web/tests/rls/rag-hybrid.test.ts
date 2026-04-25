/**
 * Hybrid search evaluation harness. Seeds known content and verifies the
 * hybrid RRF RPC ranks the "right" chunk first on a curated question set.
 *
 * Runs against the same live-Supabase stack as the other RLS tests. Uses
 * the service role so we can ignore RLS and focus on retrieval quality —
 * policy-layer tests live elsewhere.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(SB_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Fixture {
  fileLabel: string;
  content: string;
}

const FIXTURES: Fixture[] = [
  {
    fileLabel: "permit-notes",
    content:
      "The city permit office requires two copies of the site plan and a notarized affidavit from the owner. Expect a 14-day review period.",
  },
  {
    fileLabel: "grocery-list",
    content:
      "Weekly grocery list: milk, eggs, coffee, kale, avocados, and a loaf of sourdough bread from the farmers market on Saturday.",
  },
  {
    fileLabel: "architect-notes",
    content:
      "The architect recommended changing the rear elevation to reduce glare from the western sun. HVAC load will drop by roughly 12%.",
  },
];

describe("hybrid search (RRF)", () => {
  let terminalId: string;
  const fileIds: Record<string, string> = {};

  beforeAll(async () => {
    // Find or create a throwaway space + terminal owned by zack.
    const { data: users } = await admin.auth.admin.listUsers();
    const zack = users?.users.find((u) => u.email === "zack@rokki.local");
    if (!zack) throw new Error("seed user zack@rokki.local missing");

    let spaceId: string;
    const { data: existing } = await admin
      .from("spaces")
      .select("id")
      .eq("slug", "rag-harness")
      .maybeSingle();
    if (existing) {
      spaceId = (existing as { id: string }).id;
    } else {
      const { data } = await admin
        .from("spaces")
        .insert({ slug: "rag-harness", name: "RAG Harness", created_by: zack.id })
        .select("id")
        .single();
      spaceId = (data as { id: string }).id;
    }

    const { data: term } = await admin
      .from("terminals")
      .select("id")
      .eq("space_id", spaceId)
      .eq("ticker", "RAG")
      .maybeSingle();
    if (term) {
      terminalId = (term as { id: string }).id;
    } else {
      const { data } = await admin
        .from("terminals")
        .insert({
          space_id: spaceId,
          ticker: "RAG",
          name: "Hybrid eval",
          type: "space",
          created_by: zack.id,
        })
        .select("id")
        .single();
      terminalId = (data as { id: string }).id;
    }

    // Wipe previous harness files + chunks so reruns are clean.
    const { data: prior } = await admin
      .from("files")
      .select("id")
      .eq("terminal_id", terminalId);
    const priorIds = ((prior ?? []) as { id: string }[]).map((r) => r.id);
    if (priorIds.length > 0) {
      await admin.from("file_chunks").delete().in("file_id", priorIds);
      await admin.from("files").delete().in("id", priorIds);
    }

    // Seed fresh files + chunks.
    for (const fx of FIXTURES) {
      const { data: f } = await admin
        .from("files")
        .insert({
          terminal_id: terminalId,
          filename: `${fx.fileLabel}.txt`,
          folder: "/",
          mime_type: "text/plain",
          size_bytes: fx.content.length,
          blob_key: `fixtures/${fx.fileLabel}`,
          uploaded_by: zack.id,
          virus_scan_status: "skipped",
          indexed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      const fileId = (f as { id: string }).id;
      fileIds[fx.fileLabel] = fileId;
      await admin.from("file_chunks").insert({
        file_id: fileId,
        terminal_id: terminalId,
        chunk_index: 0,
        content: fx.content,
        tokens: Math.round(fx.content.length / 4),
        embedding: null, // embeddings not required; FTS half carries.
      });
    }
  }, 30_000);

  // Queries chosen so at least two distinct content words hit the target
  // fixture. FTS uses websearch_to_tsquery with the english config;
  // short stopwords (how, many, for, from) are dropped before matching.
  const cases: Array<{ q: string; expect: string }> = [
    { q: "permit office site plan copies", expect: "permit-notes" },
    { q: "sourdough bread farmers market", expect: "grocery-list" },
    { q: "architect rear elevation glare", expect: "architect-notes" },
  ];

  for (const c of cases) {
    it(`retrieves "${c.expect}" for query "${c.q}"`, async () => {
      const { data, error } = await admin.rpc("search_chunks_hybrid", {
        _query: c.q,
        _query_embedding: null,
        _terminal: terminalId,
        _limit: 3,
      });
      expect(error).toBeNull();
      type Row = { file_id: string; score: number };
      const rows = (data ?? []) as Row[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].file_id).toBe(fileIds[c.expect]);
    });
  }

  it("filters by terminal_id", async () => {
    const { data } = await admin.rpc("search_chunks_hybrid", {
      _query: "sourdough",
      _query_embedding: null,
      _terminal: "00000000-0000-0000-0000-000000000000",
      _limit: 5,
    });
    expect((data ?? []).length).toBe(0);
  });
});
