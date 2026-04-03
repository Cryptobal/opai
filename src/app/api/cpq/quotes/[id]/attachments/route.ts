/**
 * API Route: /api/cpq/quotes/[id]/attachments
 * GET  - Listar adjuntos de la cotización
 * POST - Subir adjunto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { uploadFile } from "@/lib/storage";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!quote) {
      return NextResponse.json({ success: false, error: "Cotización no encontrada" }, { status: 404 });
    }

    const attachments = await prisma.cpqQuoteAttachment.findMany({
      where: { quoteId: id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        publicUrl: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: attachments });
  } catch (error) {
    console.error("[CPQ] Error listing attachments:", error);
    return NextResponse.json({ success: false, error: "Error al listar adjuntos" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });
    if (!quote) {
      return NextResponse.json({ success: false, error: "Cotización no encontrada" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "Archivo requerido (field: file)" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "El archivo excede 10MB" }, { status: 400 });
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { success: false, error: "Tipo no permitido. Use: PDF, imágenes, Word, Excel" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadFile(buffer, file.name, mimeType, "cpq-quotes", ctx.tenantId);

    const attachment = await prisma.cpqQuoteAttachment.create({
      data: {
        quoteId: id,
        tenantId: ctx.tenantId,
        fileName: uploadResult.fileName,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        storageKey: uploadResult.storageKey,
        publicUrl: uploadResult.publicUrl || null,
      },
    });

    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_attachment_added",
      details: { quoteCode: quote?.code ?? null, fileName: attachment.fileName },
      createdBy: ctx.userId,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          publicUrl: attachment.publicUrl,
          createdAt: attachment.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[CPQ] Error uploading attachment:", error);
    return NextResponse.json({ success: false, error: "Error al subir archivo" }, { status: 500 });
  }
}
