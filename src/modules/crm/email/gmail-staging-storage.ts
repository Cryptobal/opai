import "server-only";

import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Credenciales R2 no configuradas");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME no configurado");
  return bucket;
}

export async function getStagedEmailFileMetadata(
  storageKey: string,
): Promise<{ size: number; mimeType: string | null }> {
  const response = await getR2Client().send(
    new HeadObjectCommand({ Bucket: getBucket(), Key: storageKey }),
  );
  return {
    size: Number(response.ContentLength ?? 0),
    mimeType: response.ContentType ?? null,
  };
}

export async function deleteStagedEmailFilesOlderThanPrefix(opts: {
  prefix: string;
  before: Date;
  limit?: number;
}): Promise<number> {
  const client = getR2Client();
  const bucket = getBucket();
  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: opts.prefix,
      MaxKeys: Math.min(Math.max(opts.limit ?? 500, 1), 1_000),
    }),
  );
  const keys = (listed.Contents ?? [])
    .filter(
      (object) =>
        object.Key &&
        object.LastModified &&
        object.LastModified.getTime() < opts.before.getTime(),
    )
    .map((object) => ({ Key: object.Key! }));
  if (keys.length === 0) return 0;
  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys, Quiet: true },
    }),
  );
  return keys.length;
}
