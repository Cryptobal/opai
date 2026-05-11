/**
 * POST /api/storage/presigned-upload
 *
 * Devuelve una URL pre-firmada que el cliente usa para subir un archivo
 * directamente a R2, sin pasar el body por el server. Resuelve el 413
 * Content Too Large que aparece cuando un PDF supera el límite de body
 * de Vercel (~4.5MB Hobby) para los endpoints que aceptan multipart.
 *
 * Flujo:
 *   1. Cliente: POST aquí con `{ fileName, mimeType, prefix }`.
 *   2. Server: devuelve `{ uploadUrl, storageKey, publicUrl, expiresIn }`.
 *   3. Cliente: `fetch(uploadUrl, { method: 'PUT', body: file })`.
 *   4. Cliente: POST al endpoint de la entidad con `{ storageKey, ... }`.
 *
 * El URL expira pronto (5 min) — el cliente debe usarlo de inmediato.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { getPresignedUploadUrl } from "@/lib/storage";

const ALLOWED_PREFIXES = new Set([
  "crm",
  "contracts",
  "leads",
  "deals",
  "accounts",
  "factoring-sims",
  "documents",
]);

const presignedUploadSchema = z.object({
  fileName: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  prefix: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const parsed = await parseBody(request, presignedUploadSchema);
  if (parsed.error) return parsed.error;

  const prefix = parsed.data.prefix ?? "crm";
  if (!ALLOWED_PREFIXES.has(prefix)) {
    return NextResponse.json(
      { success: false, error: `Prefijo no permitido: ${prefix}` },
      { status: 400 },
    );
  }

  try {
    const result = await getPresignedUploadUrl({
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      prefix,
      tenantId: ctx.tenantId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Error generando URL pre-firmada",
      },
      { status: 500 },
    );
  }
}
