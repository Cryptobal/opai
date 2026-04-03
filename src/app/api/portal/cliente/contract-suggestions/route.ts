import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST — Client submits a clause edit suggestion via contractClientToken
 * Body: { contractClientToken, clauseNumber, clauseTitle, originalContent, suggestedContent, clientNote? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractClientToken, clauseNumber, clauseTitle, originalContent, suggestedContent, clientNote } = body;

    if (!contractClientToken || !clauseNumber || !originalContent || !suggestedContent) {
      return NextResponse.json(
        { success: false, error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    // Find document by contractClientToken
    const document = await prisma.document.findFirst({
      where: { contractClientToken },
      select: {
        id: true,
        tenantId: true,
        status: true,
        contractMetadata: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    // Validate status allows suggestions
    if (!["draft", "review"].includes(document.status)) {
      return NextResponse.json(
        { success: false, error: "El documento no acepta sugerencias en su estado actual" },
        { status: 400 }
      );
    }

    // Validate clause is editable
    const metadata = document.contractMetadata as Record<string, any> | null;
    const clauseEditability = metadata?.clauseEditability as Record<string, boolean> | null;
    if (clauseEditability && clauseEditability[clauseNumber] === false) {
      return NextResponse.json(
        { success: false, error: "Esta cláusula no permite ediciones" },
        { status: 403 }
      );
    }

    // Create suggestion
    const suggestion = await prisma.contractSuggestion.create({
      data: {
        tenantId: document.tenantId,
        documentId: document.id,
        clauseNumber,
        clauseTitle: clauseTitle || clauseNumber,
        originalContent,
        suggestedContent,
        clientNote: clientNote || null,
      },
    });

    // Update document status to "review" if it was "draft"
    if (document.status === "draft") {
      await prisma.document.update({
        where: { id: document.id },
        data: { status: "review" },
      });

      await prisma.docHistory.create({
        data: {
          documentId: document.id,
          action: "status_changed",
          details: { from: "draft", to: "review", reason: "client_suggestion" },
          createdBy: "portal_client",
        },
      });
    }

    return NextResponse.json({ success: true, data: suggestion });
  } catch (error) {
    console.error("Error creating contract suggestion:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
