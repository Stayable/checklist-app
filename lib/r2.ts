import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 access (server-only — never import from client components).
// Bucket is PRIVATE per ARCH §9.2: all access goes through presigned URLs
// (15-min upload, 1-hour download). The S3 client is a module singleton like
// lib/db.ts. R2_PUBLIC_URL is intentionally unused — private bucket + presigned
// GETs, so there is no public base URL.

export const UPLOAD_URL_TTL_SECONDS = 15 * 60; // ARCH §9.2
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60; // ARCH §9.2

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

let client: S3Client | null = null;

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

function bucket(): string {
  return requiredEnv("R2_BUCKET_NAME");
}

/** Presigned PUT for a client-side direct upload (15-min TTL). */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
}

/** Presigned GET for displaying a stored object (1-hour TTL). */
export async function presignDownload(key: string): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

// --- Key builders -----------------------------------------------------------
// Keep all R2 key shapes in one place so the bucket layout stays predictable.

/** Throwaway objects from /photo-test. Safe to bulk-delete by prefix. */
export function photoTestKey(userId: string): string {
  return `photo-test/${userId}/${crypto.randomUUID()}.jpg`;
}

/** Checklist response photos: grouped by instance, then question. */
export function responsePhotoKey(instanceId: string, questionId: string): string {
  return `instances/${instanceId}/${questionId}/${crypto.randomUUID()}.jpg`;
}

/** Issue resolution photos. */
export function issuePhotoKey(issueId: string): string {
  return `issues/${issueId}/${crypto.randomUUID()}.jpg`;
}

/** Contractor-job problem photos (T2) — what the contractor needs to see. */
export function contractorJobPhotoKey(jobId: string): string {
  return `contractor-jobs/${jobId}/${crypto.randomUUID()}.jpg`;
}
