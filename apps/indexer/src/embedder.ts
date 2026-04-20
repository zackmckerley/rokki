/**
 * Embedder — optional. If OPENAI_API_KEY is set, we call OpenAI's
 * text-embedding-3-small (1536 dim, matches the schema). Otherwise we
 * return null vectors and the rest of the pipeline runs without embeddings;
 * retrieval falls back to Postgres FTS over chunk content.
 *
 * This lets the feature be useful on day one without external accounts and
 * upgrades seamlessly when a key is added.
 */

const OPENAI_URL =
  process.env.OPENAI_EMBEDDINGS_URL ?? "https://api.openai.com/v1/embeddings";
const MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const BATCH = 96; // OpenAI accepts up to 2048 but smaller keeps retries cheap

export function embeddingsEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Embed an array of strings. Returns an array of same length where each
 * entry is either a 1536-dim vector or null (when embeddings are disabled
 * or a batch failed). The caller should store chunks either way.
 */
export async function embedBatch(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  if (!embeddingsEnabled()) return texts.map(() => null);

  const out: (number[] | null)[] = new Array(texts.length).fill(null);
  for (let off = 0; off < texts.length; off += BATCH) {
    const slice = texts.slice(off, off + BATCH);
    try {
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, input: slice }),
      });
      if (!res.ok) {
        const msg = await res.text();
        console.error(
          `[indexer] openai embed failed (${res.status}): ${msg.slice(0, 200)}`,
        );
        continue;
      }
      const body = (await res.json()) as {
        data: { index: number; embedding: number[] }[];
      };
      for (const row of body.data) out[off + row.index] = row.embedding;
    } catch (e) {
      console.error(
        "[indexer] openai embed errored:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return out;
}

/**
 * Embed a single string. Used by retrieval-side tools for the query vector.
 */
export async function embedQuery(text: string): Promise<number[] | null> {
  const [v] = await embedBatch([text]);
  return v;
}
