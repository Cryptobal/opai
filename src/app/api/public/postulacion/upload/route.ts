import { NextRequest, NextResponse } from "next/server";
import { isValidPostulacionToken } from "@/lib/postulacion-token";
import { uploadFile } from "@/lib/storage";
import { getDefaultTenantId } from "@/lib/tenant";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const token = String(formData.get("token") || "");
    if (!isValidPostulacionToken(token)) {
      return NextResponse.json({ success: false, error: "Token inválido" }, { status: 403 });
    }

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
    const tenantId = await getDefaultTenantId();
    const result = await uploadFile(buffer, file.name, mimeType, "guardias", tenantId);

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
    console.error("[POSTULACION] Error uploading file:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo subir el archivo" },
      { status: 500 }
    );
  }
}
