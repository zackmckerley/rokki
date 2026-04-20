import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * S3-compatible reader for the indexer. Same env-var surface as the web app
 * and mcp-server (MinIO in dev, Azure Blob S3 API or AWS S3 in prod).
 */

const BUCKET =
  process.env.MINIO_BUCKET ?? process.env.STORAGE_BUCKET ?? "rokki-files-local";

const endpoint = process.env.MINIO_ENDPOINT ?? process.env.STORAGE_ENDPOINT;

const client = new S3Client({
  region: process.env.STORAGE_REGION ?? "us-east-1",
  endpoint,
  forcePathStyle: Boolean(endpoint),
  credentials: {
    accessKeyId:
      process.env.MINIO_ACCESS_KEY ?? process.env.STORAGE_ACCESS_KEY ?? "",
    secretAccessKey:
      process.env.MINIO_SECRET_KEY ?? process.env.STORAGE_SECRET_KEY ?? "",
  },
});

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  if (!res.Body) throw new Error(`object not found: ${key}`);
  const bodyAny = res.Body as unknown as {
    transformToByteArray?: () => Promise<Uint8Array>;
    transformToWebStream?: () => ReadableStream<Uint8Array>;
  };
  if (typeof bodyAny.transformToByteArray === "function") {
    return await bodyAny.transformToByteArray();
  }
  // Fallback — read the web stream manually.
  const stream = bodyAny.transformToWebStream!();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
