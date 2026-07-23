import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
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
): Promise<{ size: number; mimeType: string | null; eTag: string | null }> {
  const response = await getR2Client().send(
    new HeadObjectCommand({ Bucket: getBucket(), Key: storageKey }),
  );
  return {
    size: Number(response.ContentLength ?? 0),
    mimeType: response.ContentType ?? null,
    eTag: response.ETag ?? null,
  };
}

/**
 * Descarga exactamente la versión verificada por HEAD. El If-Match cierra la
 * carrera donde una URL PUT aún vigente reemplazaba el objeto entre HEAD y GET.
 */
export async function getStagedEmailFileBuffer(params: {
  storageKey: string;
  expectedSize: number;
  eTag: string | null;
}): Promise<Buffer> {
  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: params.storageKey,
      ...(params.eTag ? { IfMatch: params.eTag } : {}),
    }),
  );
  const declaredSize = Number(response.ContentLength);
  if (
    !Number.isFinite(declaredSize) ||
    declaredSize !== params.expectedSize
  ) {
    throw new Error("El tamaño del adjunto cambió durante la subida");
  }
  if (!response.Body) {
    throw new Error("Adjunto vacío o no encontrado en storage");
  }
  const bytes = await response.Body.transformToByteArray();
  if (bytes.byteLength !== params.expectedSize) {
    throw new Error("El tamaño real del adjunto no coincide");
  }
  return Buffer.from(bytes);
}

export async function deleteStagedEmailFilesOlderThanPrefix(opts: {
  prefix: string;
  before: Date;
  limit?: number;
  /** Keys a preservar (ej. adjuntos de envíos programados pendientes en el outbox). */
  excludeKeys?: Set<string>;
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
        object.LastModified.getTime() < opts.before.getTime() &&
        !opts.excludeKeys?.has(object.Key),
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
