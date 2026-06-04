// One-off R2 connectivity check. Run: node --env-file=.env.local scripts/r2-check.mjs
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const key = "_connectivity-check/hello.txt";

try {
  await s3.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));
  console.log("HeadBucket: OK — bucket reachable, credentials valid");

  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: "rise8-ops r2 check", ContentType: "text/plain" }));
  console.log("PutObject: OK");

  const got = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  console.log("GetObject: OK —", await got.Body.transformToString());

  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  console.log("DeleteObject: OK — cleaned up");

  try {
    const cors = await s3.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET_NAME }));
    console.log("CORS:", JSON.stringify(cors.CORSRules));
  } catch (e) {
    if (e.Code === "NoSuchCORSConfiguration" || e.name === "NoSuchCORSConfiguration") {
      console.log("CORS: none configured yet (expected)");
    } else {
      console.log("CORS check error:", e.name, e.message);
    }
  }

  console.log("\nALL GOOD");
} catch (e) {
  console.error("FAILED:", e.name, "—", e.message);
  process.exit(1);
}
