/**
 * API Route: /api/chat/upload
 * POST — Upload files for chat. Accept FormData with files.
 *        Max 5 files, 10MB each.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
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
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

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
        {
          success: false,
          error: `Máximo ${MAX_FILES} archivos por upload`,
        },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `El archivo "${file.name}" excede el límite de 10MB` },
          { status: 400 }
        );
      }
      if (!isAllowedMime(file.type || "application/octet-stream")) {
        return NextResponse.json(
          { success: false, error: `Tipo de archivo no permitido: "${file.name}"` },
          { status: 400 }
        );
      }
    }

    // Upload all files
    const results = await Promise.all(
      files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = file.type || "application/octet-stream";

        const uploaded = await uploadFile(buffer, file.name, mimeType, "chat", ctx.tenantId);

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
  } catch (err: any) {
    console.error("Error uploading chat files:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
