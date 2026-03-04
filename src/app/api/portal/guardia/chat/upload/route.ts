/**
 * API Route: /api/portal/guardia/chat/upload
 * POST — Upload files for chat. Accept FormData with files.
 *        Max 5 files, 10MB each.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGuardSession } from "@/lib/portal-chat-auth";
import { uploadFile } from "@/lib/storage";
import { randomUUID } from "node:crypto";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const session = getGuardSession(request);
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
        {
          success: false,
          error: `Máximo ${MAX_FILES} archivos por upload`,
        },
        { status: 400 }
      );
    }

    // Validate file sizes
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
    }

    // Upload all files
    const results = await Promise.all(
      files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = file.type || "application/octet-stream";

        const uploaded = await uploadFile(buffer, file.name, mimeType, "chat");

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
    console.error("[Portal Guardia] Error uploading chat files:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
