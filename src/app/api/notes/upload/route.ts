/**
 * API Route: /api/notes/upload
 * POST — Upload file attachments for notes (R2 storage)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { uploadFile } from "@/lib/storage";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

const ALLOWED_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // PDF
  "application/pdf",
  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { success: false, error: "No se proporcionaron archivos" },
        { status: 400 },
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, error: `Máximo ${MAX_FILES} archivos por nota` },
        { status: 400 },
      );
    }

    const results = [];

    for (const file of files) {
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { success: false, error: `${file.name} excede el límite de 10 MB` },
          { status: 400 },
        );
      }

      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json(
          { success: false, error: `Tipo de archivo no permitido: ${file.name}` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadFile(buffer, file.name, file.type, "notes");
      results.push({
        fileName: result.fileName,
        fileUrl: result.publicUrl,
        fileType: result.mimeType,
        fileSize: result.size,
        storageKey: result.storageKey,
      });
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("Error uploading note attachments:", error);
    return NextResponse.json(
      { success: false, error: "Error al subir archivos" },
      { status: 500 },
    );
  }
}
