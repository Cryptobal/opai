/**
 * API Route: /api/ops/protocols/ai-from-pdf
 * POST - Extract protocol from an uploaded PDF using AI
 *
 * Receives FormData: file (PDF), installationId
 * Stores the document, extracts protocol, creates sections + items.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { uploadFile } from "@/lib/storage";
import { extractProtocolFromPdf } from "@/lib/protocol-ai";

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const formData = await request.formData();
    const file = formData.get("file");
    const installationId = formData.get("installationId") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Archivo PDF requerido (field: file)" },
        { status: 400 },
      );
    }

    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "Solo se aceptan archivos PDF" },
        { status: 400 },
      );
    }

    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el máximo de 20MB" },
        { status: 400 },
      );
    }

    // Verify installation belongs to tenant
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to storage
    const uploaded = await uploadFile(buffer, file.name, file.type, "protocols");

    // Save document record
    await prisma.opsProtocolDocument.create({
      data: {
        tenantId: ctx.tenantId,
        installationId,
        fileName: file.name,
        fileUrl: uploaded.publicUrl,
        fileSize: file.size,
        processed: false,
        uploadedBy: ctx.userId,
      },
    });

    // Extract protocol from PDF with AI
    const pdfBase64 = buffer.toString("base64");
    const result = await extractProtocolFromPdf(pdfBase64, file.name);

    // Persist sections + items
    const sections = await prisma.$transaction(
      result.sections.map((section, sIdx) =>
        prisma.opsProtocolSection.create({
          data: {
            tenantId: ctx.tenantId,
            installationId,
            title: section.title,
            icon: section.icon,
            order: sIdx,
            items: {
              create: section.items.map((item, iIdx) => ({
                tenantId: ctx.tenantId,
                title: item.title,
                description: item.description,
                order: iIdx,
                source: "ai_from_pdf",
                createdBy: ctx.userId,
              })),
            },
          },
          include: { items: { orderBy: { order: "asc" } } },
        }),
      ),
    );

    // Mark document as processed
    await prisma.opsProtocolDocument.updateMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        fileName: file.name,
        processed: false,
      },
      data: { processed: true },
    });

    return NextResponse.json({ success: true, data: sections }, { status: 201 });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error extracting protocol from PDF:", error);
    const msg = error instanceof Error ? error.message : "Error al extraer protocolo del PDF";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}
