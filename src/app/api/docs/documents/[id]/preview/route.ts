/**
 * API Route: /api/docs/documents/[id]/preview
 * GET - Devuelve el contenido del documento con tokens y condicionales {{#if}} resueltos.
 * Usa plantilla + datos actuales del guardia (contractStartDate, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveDocumentContentForDisplay } from "@/lib/docs/resolve-document-content";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { associations: true },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const guardiaIdFromQuery = searchParams.get("guardiaId");

    let finalContent = await resolveDocumentContentForDisplay({
      tenantId: ctx.tenantId,
      documentId: id,
      document: {
        content: document.content,
        templateId: document.templateId,
        module: document.module,
      },
      guardiaIdOverride: guardiaIdFromQuery || undefined,
    });
    if (finalContent && typeof finalContent === "object") {
      const c = finalContent as { type?: string; content?: unknown[] };
      if (!(c.type === "doc" && Array.isArray(c.content))) {
        const inner = (c as Record<string, unknown>).content as { type?: string; content?: unknown[] } | undefined;
        finalContent = inner?.type === "doc" && Array.isArray(inner.content) ? inner : { type: "doc", content: [] };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...document,
        content: finalContent,
      },
    });
  } catch (error) {
    console.error("Error fetching document preview:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar vista previa" },
      { status: 500 }
    );
  }
}
