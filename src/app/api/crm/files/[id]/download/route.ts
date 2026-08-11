/**
 * API Route: GET /api/crm/files/[id]/download
 * Descarga el binario del Documento (usado por el chatbot / "Descargar documento").
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { getFileBuffer } from "@/lib/storage";
import { requireTenantModule } from "@/lib/require-module";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const file = await prisma.documento.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { fileName: true, mimeType: true, storageKey: true },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo no encontrado" },
        { status: 404 }
      );
    }

    if (!file.storageKey) {
      return NextResponse.json(
        { success: false, error: "Archivo sin binario disponible en almacenamiento" },
        { status: 404 }
      );
    }

    const buffer = await getFileBuffer(file.storageKey, 25 * 1024 * 1024);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (e) {
    console.error("[CRM] download error:", e);
    return NextResponse.json(
      { success: false, error: "Error al descargar archivo" },
      { status: 500 }
    );
  }
}
