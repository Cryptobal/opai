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

    // Notify admin about the new suggestion
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { title: true },
      });
      const { sendNotification } = await import("@/lib/notification-service");
      await sendNotification({
        tenantId,
        type: "contract_suggestion",
        title: `Sugerencia de edición en contrato`,
        message: `El cliente sugirió cambios en la cláusula ${clauseNumber} del documento "${document?.title ?? "Contrato"}"`,
        data: { documentId, suggestionId: suggestion.id, clauseNumber },
        link: `/opai/documentos/${documentId}`,
      });
    } catch (e) {
      console.warn("Failed to send suggestion notification:", e);
    }

    // Push notification to admins
    try {
      const { sendPushToAdmins } = await import("@/lib/pwa/push-service");
      await sendPushToAdmins(
        tenantId,
        "contract_suggestion",
        "Sugerencia de edición en contrato",
        `Cláusula ${clauseNumber}: ${(clientNote || suggestedContent).slice(0, 80)}`,
        `/opai/documentos/${documentId}`,
      );
    } catch (e) {
      console.warn("Failed to send suggestion push:", e);
    }

    // Email to admin(s)
    try {
      const docForEmail = await prisma.document.findUnique({
        where: { id: documentId },
        select: { title: true },
      });
      const admins = await prisma.admin.findMany({
        where: { tenantId, role: { in: ["owner", "admin"] }, status: "active" },
        select: { email: true },
      });
      if (admins.length > 0) {
        const { resend, getTenantEmailConfig } = await import("@/lib/resend");
        const emailConfig = await getTenantEmailConfig(tenantId);
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://opai.gard.cl";
        for (const admin of admins) {
          await resend.emails.send({
            from: emailConfig.from,
            replyTo: emailConfig.replyTo,
            to: admin.email,
            subject: `Sugerencia de edición — ${docForEmail?.title ?? "Contrato"}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;">
                <h2 style="color:#0d9488;">Sugerencia de edición en contrato</h2>
                <p>El cliente ha sugerido cambios en la <strong>cláusula ${clauseNumber}</strong> del documento <strong>"${docForEmail?.title ?? "Contrato"}"</strong>.</p>
                ${clientNote ? `<p><em>Nota del cliente:</em> ${clientNote}</p>` : ""}
                <p><a href="${siteUrl}/opai/documentos/${documentId}" style="display:inline-block;padding:10px 20px;background:#0d9488;color:white;border-radius:6px;text-decoration:none;">Ver sugerencia</a></p>
              </div>
            `,
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Failed to send suggestion email:", e);
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
