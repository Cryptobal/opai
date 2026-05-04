/**
 * API Route: /api/docs/documents/[id]
 * GET    - Obtener documento por ID
 * PATCH  - Actualizar documento
 * DELETE - Eliminar documento
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireDocsView, requireDocsEdit, requireDocsDelete } from "@/lib/api-auth-docs";
import { updateDocumentSchema } from "@/lib/validations/docs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsView(ctx, "gestion");
    if (forbidden) return forbidden;

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        template: { select: { id: true, name: true, module: true, category: true } },
        associations: true,
        history: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    // Enrich associations with entity names for display
    const enrichedAssociations = await Promise.all(
      (document.associations ?? []).map(async (assoc) => {
        let entityName: string | null = null;
        try {
          if (assoc.entityType === "crm_account") {
            const e = await prisma.crmAccount.findUnique({ where: { id: assoc.entityId }, select: { name: true } });
            entityName = e?.name ?? null;
          } else if (assoc.entityType === "crm_contact") {
            const e = await prisma.crmContact.findUnique({ where: { id: assoc.entityId }, select: { firstName: true, lastName: true } });
            entityName = e ? `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() : null;
          } else if (assoc.entityType === "crm_installation") {
            const e = await prisma.crmInstallation.findUnique({ where: { id: assoc.entityId }, select: { name: true } });
            entityName = e?.name ?? null;
          } else if (assoc.entityType === "crm_deal") {
            const e = await prisma.crmDeal.findUnique({ where: { id: assoc.entityId }, select: { title: true } });
            entityName = e?.title ?? null;
          }
        } catch {}
        return { ...assoc, entityName };
      })
    );

    return NextResponse.json({ success: true, data: { ...document, associations: enrichedAssociations } });
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documento" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsEdit(ctx, "gestion");
    if (forbidden) return forbidden;

    const { id } = await params;
    const parsed = await parseBody(request, updateDocumentSchema);
    if (parsed.error) return parsed.error;

    const existing = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    const { associations, ...updateData } = parsed.data;

    const updated = await prisma.$transaction(async (tx) => {
      // Prepare date fields
      const dataToUpdate: any = { ...updateData };
      if (updateData.effectiveDate !== undefined) {
        dataToUpdate.effectiveDate = updateData.effectiveDate
          ? new Date(updateData.effectiveDate)
          : null;
      }
      if (updateData.expirationDate !== undefined) {
        dataToUpdate.expirationDate = updateData.expirationDate
          ? new Date(updateData.expirationDate)
          : null;
      }
      if (updateData.renewalDate !== undefined) {
        dataToUpdate.renewalDate = updateData.renewalDate
          ? new Date(updateData.renewalDate)
          : null;
      }

      // Track status change
      if (updateData.status && updateData.status !== existing.status) {
        // If approving, record who approved
        if (updateData.status === "approved") {
          dataToUpdate.approvedBy = ctx.userId;
          dataToUpdate.approvedAt = new Date();
        }

        await tx.docHistory.create({
          data: {
            documentId: id,
            action: "status_changed",
            details: {
              from: existing.status,
              to: updateData.status,
            },
            createdBy: ctx.userId,
          },
        });
      }

      // Track content change
      if (updateData.content) {
        await tx.docHistory.create({
          data: {
            documentId: id,
            action: "edited",
            details: { contentUpdated: true },
            createdBy: ctx.userId,
          },
        });
      }

      const updResult = await tx.document.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data: dataToUpdate,
      });
      if (updResult.count === 0) {
        throw new Error("DOCUMENT_NOT_FOUND");
      }
      const result = await tx.document.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: {
          template: { select: { id: true, name: true, module: true, category: true } },
          associations: true,
        },
      })!;

      // Update associations if provided
      if (associations) {
        await tx.docAssociation.deleteMany({ where: { documentId: id, document: { tenantId: ctx.tenantId } } });
        if (associations.length > 0) {
          await tx.docAssociation.createMany({
            data: associations.map((a) => ({
              documentId: id,
              entityType: a.entityType,
              entityId: a.entityId,
              role: a.role || "primary",
            })),
          });
        }
      }

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }
    console.error("Error updating document:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar documento" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsDelete(ctx, "gestion");
    if (forbidden) return forbidden;

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    await prisma.document.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar documento" },
      { status: 500 }
    );
  }
}
