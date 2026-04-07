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
