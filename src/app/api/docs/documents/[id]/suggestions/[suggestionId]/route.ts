import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

/**
 * PATCH — Admin approves or rejects a suggestion
 * Body: { action: "approve" | "reject", adminComment?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; suggestionId: string }> }
) {
  try {
    const { id: documentId, suggestionId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const { action, adminComment } = body;

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Acción inválida. Debe ser 'approve' o 'reject'" },
        { status: 400 }
      );
    }

    // Find document and suggestion
    const document = await prisma.document.findFirst({
      where: { id: documentId, tenantId: ctx.tenantId },
    });

    if (!document) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const suggestion = await prisma.contractSuggestion.findFirst({
      where: { id: suggestionId, documentId, tenantId: ctx.tenantId },
    });

    if (!suggestion) {
      return NextResponse.json({ success: false, error: "Sugerencia no encontrada" }, { status: 404 });
    }

    if (suggestion.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Esta sugerencia ya fue resuelta" },
        { status: 400 }
      );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Update suggestion
    const updated = await prisma.contractSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: newStatus,
        adminComment: adminComment || null,
        resolvedBy: ctx.userId,
        resolvedAt: new Date(),
      },
    });

    // If approved, update the document content by replacing the clause text
    if (action === "approve") {
      // We update the document content: find and replace the original clause text
      const content = document.content as any;
      if (content && typeof content === "object") {
        const updatedContent = replaceClauseContent(
          content,
          suggestion.clauseNumber,
          suggestion.originalContent,
          suggestion.suggestedContent
        );

        await prisma.document.update({
          where: { id: documentId },
          data: { content: updatedContent },
        });
      }
    }

    // Create history entry
    await prisma.docHistory.create({
      data: {
        documentId,
        action: "edited",
        details: {
          type: "suggestion_resolved",
          suggestionId,
          clauseNumber: suggestion.clauseNumber,
          action: newStatus,
          adminComment: adminComment || null,
        },
        createdBy: ctx.userId,
      },
    });

    // Check if all suggestions are resolved — if so, we can move doc back to draft
    const pendingSuggestions = await prisma.contractSuggestion.count({
      where: { documentId, tenantId: ctx.tenantId, status: "pending" },
    });

    if (pendingSuggestions === 0 && document.status === "review") {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "draft" },
      });

      await prisma.docHistory.create({
        data: {
          documentId,
          action: "status_changed",
          details: { from: "review", to: "draft", reason: "all_suggestions_resolved" },
          createdBy: ctx.userId,
        },
      });
    }

    // Email client contact about the resolution
    try {
      // Find the contact associated with this document
      const contactAssoc = await prisma.docAssociation.findFirst({
        where: { documentId, entityType: "crm_contact" },
        select: { entityId: true },
      });
      if (contactAssoc) {
        const contact = await prisma.crmContact.findUnique({
          where: { id: contactAssoc.entityId },
          select: { email: true, firstName: true },
        });
        if (contact?.email) {
          const { resend, getTenantEmailConfig } = await import("@/lib/resend");
          const emailConfig = await getTenantEmailConfig(ctx.tenantId);
          const statusLabel = action === "approve" ? "aprobada" : "rechazada";
          const statusColor = action === "approve" ? "#059669" : "#dc2626";
          await resend.emails.send({
            from: emailConfig.from,
            replyTo: emailConfig.replyTo,
            to: contact.email,
            subject: `Sugerencia de contrato ${statusLabel} — Cláusula ${suggestion.clauseNumber}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;">
                <h2 style="color:${statusColor};">Sugerencia ${statusLabel}</h2>
                <p>Hola ${contact.firstName ?? ""},</p>
                <p>Su sugerencia de edición en la <strong>cláusula ${suggestion.clauseNumber}</strong> ha sido <strong style="color:${statusColor};">${statusLabel}</strong>.</p>
                ${adminComment ? `<p><em>Comentario:</em> ${adminComment}</p>` : ""}
                ${action === "approve" ? "<p>El texto del contrato ha sido actualizado con su propuesta.</p>" : "<p>El texto original del contrato se mantiene sin cambios.</p>"}
                <p>Puede revisar el estado actualizado del contrato en su portal.</p>
              </div>
            `,
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Failed to send suggestion resolution email:", e);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error resolving suggestion:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

/**
 * Replace clause content in Tiptap JSON document.
 * Walks the document tree looking for text that matches originalContent within the clause.
 */
function replaceClauseContent(doc: any, clauseNumber: string, originalContent: string, newContent: string): any {
  if (!doc || typeof doc !== "object") return doc;

  // Walk through document nodes
  if (doc.type === "text" && typeof doc.text === "string") {
    if (doc.text.includes(originalContent)) {
      return { ...doc, text: doc.text.replace(originalContent, newContent) };
    }
    return doc;
  }

  if (Array.isArray(doc.content)) {
    return {
      ...doc,
      content: doc.content.map((node: any) => replaceClauseContent(node, clauseNumber, originalContent, newContent)),
    };
  }

  return doc;
}
