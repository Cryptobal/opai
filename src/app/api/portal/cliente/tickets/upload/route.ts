/**
 * POST /api/portal/cliente/tickets/upload
 *
 * Subida de adjuntos para tickets del portal cliente (PR5).
 *
 * - Formato: `multipart/form-data` con campo `files` (1..MAX_FILES).
 * - Sube a R2 bajo la carpeta `tickets` con prefijo por tenant (defensa
 *   adicional sobre la misma separación lógica de storage).
 * - Devuelve descriptores `{ id, fileName, fileUrl, fileType, fileSize }`
 *   listos para ser pasados al POST de crear ticket o comentario.
 *
 * Este endpoint no asocia los archivos a ningún ticket — eso lo hace
 * `POST /tickets` o `POST /tickets/[id]/comments` al aceptar el array
 * `attachments`. Así el cliente puede ver previews antes de enviar.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { uploadFile } from "@/lib/storage";
import { randomUUID } from "node:crypto";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
];

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se enviaron archivos" },
        { status: 400 }
      );
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, error: `Máximo ${MAX_FILES} archivos por upload` },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            success: false,
            error: `El archivo "${file.name}" excede el límite de 10MB`,
          },
          { status: 400 }
        );
      }
      if (!isAllowedMime(file.type || "application/octet-stream")) {
        return NextResponse.json(
          {
            success: false,
            error: `Tipo de archivo no permitido: "${file.name}"`,
          },
          { status: 400 }
        );
      }
    }

    const results = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const mimeType = file.type || "application/octet-stream";
        const uploaded = await uploadFile(
          buffer,
          file.name,
          mimeType,
          "tickets",
          session.tenantId
        );
        return {
          id: randomUUID(),
          fileName: uploaded.fileName,
          fileUrl: uploaded.publicUrl,
          fileType: uploaded.mimeType,
          fileSize: uploaded.size,
        };
      })
    );

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error("[Portal Cliente] tickets upload error:", err);
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
