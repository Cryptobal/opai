import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["application/pdf"];

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "config", "inteligencia_artificial")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver documentos globales" },
        { status: 403 },
      );
    }

    const documents = await prisma.protocolDocument.findMany({
      where: { tenantId: ctx.tenantId, scope: "global" },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("[GLOBAL-DOCS] Error listing documents:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los documentos" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "config", "inteligencia_artificial")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para subir documentos globales" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo requerido" },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Solo se permiten archivos PDF" },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede 10 MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadFile(buffer, file.name, file.type, "global-docs", ctx.tenantId);

    const document = await prisma.protocolDocument.create({
      data: {
        tenantId: ctx.tenantId,
        scope: "global",
        fileName: uploaded.fileName,
        fileUrl: uploaded.publicUrl,
        storageKey: uploaded.storageKey,
        fileSize: uploaded.size,
      },
    });

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    console.error("[GLOBAL-DOCS] Error uploading document:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo subir el documento" },
      { status: 500 },
    );
  }
}
