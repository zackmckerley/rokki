/**
 * Query-side embedder for the MCP server. Mirror of apps/indexer/src/embedder.ts
 * (kept in-package to avoid creating a shared workspace module just for this).
 * If you change logic here, change it there too.
 */

const OPENAI_URL =
  process.env.OPENAI_EMBEDDINGS_URL ?? "https://api.openai.com/v1/embeddings";
const MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export function embeddingsEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input: [text] }),
    });
    if (!res.ok) {
      console.error(
        `[mcp] embed query failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
      );
      return null;
    }
    const body = (await res.json()) as {
      data: { embedding: number[] }[];
    };
    return body.data[0]?.embedding ?? null;
  } catch (e) {
    console.error(
      "[mcp] embed query errored:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

export function vectorLiteral(v: number[]): string {
  return `[${v.map((n) => n.toFixed(6)).join(",")}]`;
}
