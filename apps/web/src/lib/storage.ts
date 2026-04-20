import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

/**
 * Storage adapter — S3-compatible client configured for MinIO in dev and
 * Azure Blob Storage (via their S3 API) or native AWS in production.
 *
 * Env vars:
 *   STORAGE_PROVIDER     minio | s3
 *   STORAGE_ENDPOINT     (minio only, e.g. http://localhost:9000)
 *   STORAGE_REGION       (default "us-east-1")
 *   STORAGE_ACCESS_KEY
 *   STORAGE_SECRET_KEY
 *   STORAGE_BUCKET
 *
 * Phase 1 keeps MinIO locally and swaps to S3/Azure in deploy without code change.
 */

const BUCKET =
  process.env.MINIO_BUCKET ?? process.env.STORAGE_BUCKET ?? "rokki-files-local";

function buildClient(): S3Client {
  const endpoint =
    process.env.MINIO_ENDPOINT ?? process.env.STORAGE_ENDPOINT;

  return new S3Client({
    region: process.env.STORAGE_REGION ?? "us-east-1",
    endpoint,
    // MinIO requires path-style. AWS works with either but defaults to virtual-hosted.
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId:
        process.env.MINIO_ACCESS_KEY ?? process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey:
        process.env.MINIO_SECRET_KEY ?? process.env.STORAGE_SECRET_KEY ?? "",
    },
  });
}

const client = buildClient();

export interface PutInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  contentLength?: number;
}

export interface PutResult {
  key: string;
  sha256: string;
}

export async function putObject({
  key,
  body,
  contentType,
  contentLength,
}: PutInput): Promise<PutResult> {
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength ?? body.byteLength,
      Metadata: { sha256 },
    }),
  );
  return { key, sha256 };
}

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

export async function deleteObject(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Server-side copy — no bytes flow through the app. Works on MinIO + S3 + Azure-via-S3-API.
 */
export async function copyObject(
  sourceKey: string,
  destKey: string,
): Promise<void> {
  await client.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      // CopySource needs to include the source bucket per S3 spec.
      CopySource: `${BUCKET}/${sourceKey}`,
      Key: destKey,
    }),
  );
}

export async function headObject(key: string): Promise<{ size: number }> {
  const res = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  return { size: res.ContentLength ?? 0 };
}

export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 300,
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

/**
 * Build an opaque blob key. Pattern: `{env}/{terminal_id}/{file_id}/v{version}/content`.
 * Never derived from user-provided filename — keys are unguessable.
 */
export function buildBlobKey(opts: {
  projectId: string;
  fileId: string;
  version: number;
}): string {
  const env = process.env.NODE_ENV === "production" ? "prod" : "dev";
  return `${env}/${opts.projectId}/${opts.fileId}/v${opts.version}/content`;
}
