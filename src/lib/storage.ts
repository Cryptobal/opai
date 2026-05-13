/**
 * Cloudflare R2 storage (S3-compatible).
 * Usado para adjuntos CRM, archivos de negocios, y futuros uploads.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const STORAGE_PROVIDER = "r2";

function getClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET_NAME son requeridos"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // R2 rechaza con 403 los PUT firmados que llevan x-amz-checksum-crc32
    // como query param firmado (el SDK v3 lo agrega por default y el browser
    // no lo envía como header, => mismatch de signature).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME no configurado");
  return bucket;
}

/**
 * Genera una key única para el objeto en R2.
 * Formato: {tenantId}/{prefix}/YYYY/MM/uuid.ext
 * Si no se pasa tenantId, usa el formato legacy: prefix/YYYY/MM/uuid.ext
 */
function buildStorageKey(
  fileName: string,
  prefix: string = "crm",
  tenantId?: string,
): string {
  const ext = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf("."))
    : "";
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uuid = randomUUID();
  const safeName = `${uuid}${ext}`;
  const basePath = `${prefix}/${y}/${m}/${safeName}`;
  return tenantId ? `${tenantId}/${basePath}` : basePath;
}

export type UploadResult = {
  storageKey: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
};

/**
 * Sube un archivo a R2.
 * @param buffer Contenido del archivo
 * @param fileName Nombre original del archivo
 * @param mimeType MIME type
 * @param prefix Prefijo en la key (ej. "crm", "leads")
 * @param tenantId ID del tenant para aislar archivos por tenant
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  prefix: string = "crm",
  tenantId?: string,
): Promise<UploadResult> {
  const client = getClient();
  const bucket = getBucket();
  const storageKey = buildStorageKey(fileName, prefix, tenantId);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
      ContentDisposition: `inline; filename="${encodeURIComponent(fileName)}"`,
    })
  );

  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") || "";
  const publicUrl = baseUrl ? `${baseUrl}/${storageKey}` : "";

  return {
    storageKey,
    publicUrl,
    fileName,
    mimeType,
    size: buffer.length,
  };
}

/**
 * Genera una URL pre-firmada para que el cliente suba un archivo
 * directamente a R2 (PUT) sin pasar el body por el server Next/Vercel.
 *
 * Esto evita el límite de body de Vercel (~4.5MB Hobby, configurable
 * en Pro) — la subida llega directo al bucket. El server sólo persiste
 * la metadata (storageKey, mime, size) después de que el PUT terminó.
 *
 * El URL expira a los `expiresInSeconds` (default 5 min).
 */
export async function getPresignedUploadUrl(opts: {
  fileName: string;
  mimeType: string;
  prefix?: string;
  tenantId?: string;
  expiresInSeconds?: number;
}): Promise<{
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  expiresIn: number;
}> {
  const client = getClient();
  const bucket = getBucket();
  const storageKey = buildStorageKey(opts.fileName, opts.prefix ?? "crm", opts.tenantId);
  // NOTA: No firmar ContentDisposition aquí — si lo incluimos, el SDK lo agrega
  // a SignedHeaders y el browser DEBE enviarlo idéntico en el PUT, si no R2
  // responde 403. Si hace falta inline display, aplicarlo al servir (GET firmado
  // con ResponseContentDisposition) o vía metadata después del upload.
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: opts.mimeType,
  });
  const expiresIn = opts.expiresInSeconds ?? 300;
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") || "";
  const publicUrl = baseUrl ? `${baseUrl}/${storageKey}` : "";
  return { uploadUrl, storageKey, publicUrl, expiresIn };
}

/**
 * Devuelve la URL pública de un archivo en R2.
 * Requiere bucket con custom domain (R2_PUBLIC_URL).
 */
export function getFileUrl(storageKey: string): string {
  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("R2_PUBLIC_URL no configurado");
  }
  return `${baseUrl}/${storageKey}`;
}

/**
 * Extrae la storageKey desde un URL público de R2. Devuelve `null` si el
 * URL no pertenece al bucket público configurado (caso legacy / URL externo).
 */
export function extractStorageKeyFromPublicUrl(url: string): string | null {
  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;
  if (!url.startsWith(`${baseUrl}/`)) return null;
  return url.slice(baseUrl.length + 1).split("?")[0];
}

/**
 * Genera un URL firmado GET que fuerza descarga con
 * `Content-Disposition: attachment`. El atributo `download` en `<a>` es
 * ignorado para URLs cross-origin; firmar `response-content-disposition`
 * en la URL es lo único que hace que R2 sirva el archivo como descarga.
 */
export async function getPresignedDownloadUrl(opts: {
  storageKey: string;
  fileName: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = getClient();
  const bucket = getBucket();
  const disposition = buildAttachmentDisposition(opts.fileName);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: opts.storageKey,
    ResponseContentDisposition: disposition,
  });
  const expiresIn = opts.expiresInSeconds ?? 300;
  return getSignedUrl(client, command, { expiresIn });
}

function buildAttachmentDisposition(fileName: string): string {
  const clean = fileName
    .replace(/[\\/\x00-\x1f"]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || "archivo";
  // ASCII fallback + RFC 5987 para soportar caracteres no-ASCII (tildes, ñ).
  const ascii = clean.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(clean);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Descarga un archivo de R2 a un Buffer en memoria.
 * Usar con cuidado: capa el tamaño con `maxBytes` para no agotar memoria.
 * Por defecto 8 MB (suficiente para PDFs/DOCX típicos de contratos).
 */
export async function getFileBuffer(
  storageKey: string,
  maxBytes: number = 8 * 1024 * 1024,
): Promise<Buffer> {
  const client = getClient();
  const bucket = getBucket();
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
  );
  if (!response.Body) {
    throw new Error("Archivo vacío o no encontrado en storage");
  }
  const bytes = await response.Body.transformToByteArray();
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `Archivo demasiado grande (${bytes.byteLength} bytes, máx ${maxBytes}).`,
    );
  }
  return Buffer.from(bytes);
}

/**
 * Elimina un archivo de R2.
 */
export async function deleteFile(storageKey: string): Promise<void> {
  const client = getClient();
  const bucket = getBucket();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    })
  );
}

export { STORAGE_PROVIDER };
