import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

/**
 * POST — Client submits a clause edit suggestion
 * Accepts either contractClientToken OR portal session auth + quoteId
 * Body: { contractClientToken?, quoteId?, clauseNumber, clauseTitle, originalContent, suggestedContent, clientNote? }
 *
 * GET — Client lists suggestions for a quote or document
 * Query: ?quoteId=xxx or ?contractClientToken=xxx
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractClientToken, quoteId, clauseNumber, clauseTitle, originalContent, suggestedContent, clientNote } = body;

    if (!clauseNumber || !originalContent || !suggestedContent) {
      return NextResponse.json(
        { success: false, error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    let documentId: string;
    let tenantId: string;

    if (contractClientToken) {
      // Find document by token
      const document = await prisma.document.findFirst({
        where: { contractClientToken },
        select: { id: true, tenantId: true, status: true, contractMetadata: true },
      });
      if (!document) {
        return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
      }
      documentId = document.id;
      tenantId = document.tenantId;
    } else if (quoteId) {
      // Portal auth flow — find document by quote association
      const cookieStore = await cookies();
      const session = parsePortalClienteSessionCookie(cookieStore.get("portal_cliente_session")?.value);
      if (!session) {
        return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
      }
      tenantId = session.tenantId;

      // Find existing document for this quote, or create one from default template
      let document = await prisma.document.findFirst({
        where: {
          tenantId,
          category: { in: ["contrato_servicio", "contrato_cliente"] },
          contractMetadata: { path: ["quoteId"], equals: quoteId },
        },
        select: { id: true, status: true },
      });

      if (!document) {
        // No document exists yet — create one using generateServiceContract
        try {
          const { generateServiceContract } = await import("@/lib/docs/generate-service-contract");
          const result = await generateServiceContract(quoteId, tenantId, "portal_client");
          if (!result.success || !result.documentId) {
            return NextResponse.json(
              { success: false, error: result.error || "No se pudo generar el documento de contrato" },
              { status: 400 }
            );
          }
          documentId = result.documentId;
        } catch (e) {
          console.error("Error auto-generating contract for suggestion:", e);
          return NextResponse.json(
            { success: false, error: "Error al preparar el documento de contrato" },
            { status: 500 }
          );
        }
      } else {
        documentId = document.id;
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Se requiere contractClientToken o quoteId" },
        { status: 400 }
      );
    }

    // Validate document status allows suggestions
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { status: true, contractMetadata: true },
    });
    if (doc && !["draft", "review"].includes(doc.status)) {
      return NextResponse.json(
        { success: false, error: "El documento no acepta sugerencias en su estado actual" },
        { status: 400 }
      );
    }

    // Validate clause is editable
    const metadata = doc?.contractMetadata as Record<string, any> | null;
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
        tenantId,
        documentId,
        clauseNumber,
        clauseTitle: clauseTitle || clauseNumber,
        originalContent,
        suggestedContent,
        clientNote: clientNote || null,
      },
    });

    // Update document status to "review" if it was "draft"
    if (doc?.status === "draft") {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "review" },
      });

      await prisma.docHistory.create({
        data: {
          documentId,
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

/**
 * GET — List suggestions for a quote (portal client)
 * Query: ?quoteId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const quoteId = searchParams.get("quoteId");
    const contractClientToken = searchParams.get("contractClientToken");

    if (!quoteId && !contractClientToken) {
      return NextResponse.json({ success: false, error: "Se requiere quoteId o contractClientToken" }, { status: 400 });
    }

    let documentId: string | null = null;

    if (contractClientToken) {
      const doc = await prisma.document.findFirst({
        where: { contractClientToken },
        select: { id: true },
      });
      documentId = doc?.id ?? null;
    } else if (quoteId) {
      const cookieStore = await cookies();
      const session = parsePortalClienteSessionCookie(cookieStore.get("portal_cliente_session")?.value);
      if (!session) {
        return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
      }
      const doc = await prisma.document.findFirst({
        where: {
          tenantId: session.tenantId,
          category: { in: ["contrato_servicio", "contrato_cliente"] },
          contractMetadata: { path: ["quoteId"], equals: quoteId },
        },
        select: { id: true },
      });
      documentId = doc?.id ?? null;
    }

    if (!documentId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const suggestions = await prisma.contractSuggestion.findMany({
      where: { documentId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        clauseNumber: true,
        clauseTitle: true,
        originalContent: true,
        suggestedContent: true,
        clientNote: true,
        adminComment: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
