import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Storage reader / writer for the MCP server. Mirrors the web app's adapter
 * (MinIO in dev, S3/Azure-via-S3-API in prod). Env vars: STORAGE_* or MINIO_*.
 */

const BUCKET =
  process.env.MINIO_BUCKET ?? process.env.STORAGE_BUCKET ?? "rokki-files-local";

const endpoint =
  process.env.MINIO_ENDPOINT ?? process.env.STORAGE_ENDPOINT;

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

export async function getObjectStream(key: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
}> {
  const res = await client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  if (!res.Body) throw new Error(`object not found: ${key}`);
  const bodyAny = res.Body as unknown as {
    transformToWebStream?: () => ReadableStream<Uint8Array>;
  };
  const body: ReadableStream<Uint8Array> =
    typeof bodyAny.transformToWebStream === "function"
      ? bodyAny.transformToWebStream()
      : (res.Body as unknown as ReadableStream<Uint8Array>);
  return {
    body,
    contentType: res.ContentType,
    contentLength:
      typeof res.ContentLength === "number" ? res.ContentLength : undefined,
  };
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const { body } = await getObjectStream(key);
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return buf;
}

export async function deleteObject(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Server-side copy — no bytes flow through the MCP server.
 */
export async function copyObject(
  sourceKey: string,
  destKey: string,
): Promise<void> {
  await client.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${sourceKey}`,
      Key: destKey,
    }),
  );
}

/**
 * Build an opaque blob key matching the web app's pattern.
 * `{env}/{terminal_id}/{file_id}/v{version}/content`
 */
export function buildBlobKey(opts: {
  projectId: string;
  fileId: string;
  version: number;
}): string {
  const env = process.env.NODE_ENV === "production" ? "prod" : "dev";
  return `${env}/${opts.projectId}/${opts.fileId}/v${opts.version}/content`;
}
