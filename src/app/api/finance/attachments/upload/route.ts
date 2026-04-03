import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { uploadFile } from "@/lib/storage";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
const ALLOWED_ATTACHMENT_TYPES = ["RECEIPT", "INVOICE", "TOLL", "OTHER"];

// ── POST: upload attachment ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para subir adjuntos" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rendicionId = formData.get("rendicionId") as string | null;
    const tripId = formData.get("tripId") as string | null;
    const attachmentType = (formData.get("attachmentType") as string) || "OTHER";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo es requerido" },
        { status: 400 },
      );
    }

    if (!rendicionId && !tripId) {
      return NextResponse.json(
        { success: false, error: "rendicionId o tripId es requerido" },
        { status: 400 },
      );
    }

    if (!ALLOWED_ATTACHMENT_TYPES.includes(attachmentType)) {
      return NextResponse.json(
        { success: false, error: `Tipo de adjunto inválido. Permitidos: ${ALLOWED_ATTACHMENT_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el tamaño máximo de 10MB" },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Tipo de archivo no permitido. Permitidos: JPG, PNG, WebP, GIF, PDF` },
        { status: 400 },
      );
    }

    // Verify ownership of the rendicion or trip
    if (rendicionId) {
      const rendicion = await prisma.financeRendicion.findFirst({
        where: { id: rendicionId, tenantId: ctx.tenantId },
      });
      if (!rendicion) {
        return NextResponse.json(
          { success: false, error: "Rendición no encontrada" },
          { status: 404 },
        );
      }
    }

    if (tripId) {
      const trip = await prisma.financeTrip.findFirst({
        where: { id: tripId, tenantId: ctx.tenantId },
      });
      if (!trip) {
        return NextResponse.json(
          { success: false, error: "Viaje no encontrado" },
          { status: 404 },
        );
      }
    }

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploadResult = await uploadFile(buffer, file.name, file.type, "finance", ctx.tenantId);

    // Create DB record
    const attachment = await prisma.financeAttachment.create({
      data: {
        tenantId: ctx.tenantId,
        rendicionId: rendicionId ?? null,
        tripId: tripId ?? null,
        fileName: uploadResult.fileName,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        storageKey: uploadResult.storageKey,
        publicUrl: uploadResult.publicUrl,
        attachmentType,
        uploadedById: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: attachment }, { status: 201 });
  } catch (error) {
    console.error("[Finance] Error uploading attachment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo subir el archivo" },
      { status: 500 },
    );
  }
}
