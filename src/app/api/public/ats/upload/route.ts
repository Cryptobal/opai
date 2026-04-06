import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

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
    const jobPostingId = String(formData.get("jobPostingId") || "");
    if (!jobPostingId) {
      return NextResponse.json(
        { success: false, error: "jobPostingId requerido" },
        { status: 400 },
      );
    }

    const job = await prisma.atsJobPosting.findUnique({
      where: { id: jobPostingId },
      select: { tenantId: true, estado: true },
    });
    if (!job || job.estado !== "ACTIVO") {
      return NextResponse.json(
        { success: false, error: "Aviso no encontrado o inactivo" },
        { status: 404 },
      );
    }
    const tenantId = job.tenantId;

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Archivo requerido (field: file)" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el máximo de 8MB" },
        { status: 400 },
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: "Tipo de archivo no permitido (solo PDF o imágenes)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name, mimeType, "guardias", tenantId);

    return NextResponse.json({
      success: true,
      data: {
        url: result.publicUrl,
        fileUrl: result.publicUrl,
        fileName: result.fileName,
        mimeType: result.mimeType,
        size: result.size,
      },
    });
  } catch (error) {
    console.error("[ATS][PUBLIC][UPLOAD] Error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo subir el archivo" },
      { status: 500 },
    );
  }
}
