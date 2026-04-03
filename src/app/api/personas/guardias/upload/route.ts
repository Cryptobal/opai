import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { uploadFile } from "@/lib/storage";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Archivo requerido (field: file)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el máximo de 8MB" },
        { status: 400 }
      );
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: "Tipo de archivo no permitido (solo PDF o imágenes)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name, mimeType, "guardias", ctx.tenantId);

    return NextResponse.json({
      success: true,
      data: {
        url: result.publicUrl,
        fileName: result.fileName,
        mimeType: result.mimeType,
        size: result.size,
      },
    });
  } catch (error) {
    console.error("[PERSONAS] Error uploading guardia document:", error);
    return NextResponse.json(
      { success: false, error: "Error al subir archivo" },
      { status: 500 }
    );
  }
}
