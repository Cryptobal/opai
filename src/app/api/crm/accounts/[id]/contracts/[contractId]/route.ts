import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';

/**
 * PATCH /api/crm/accounts/[id]/contracts/[contractId]
 * Update contract status, dates, or portal visibility.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const modCheck = await requireTenantModule('crm');
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx, "accounts");
  if (forbidden) return forbidden;

  const { id: accountId, contractId } = await params;

  try {
    const body = await request.json();
    const { status, effectiveDate, expirationDate, alertDaysBefore, portalVisible } = body;

    // Verify the document belongs to this account and tenant
    const doc = await prisma.document.findFirst({
      where: {
        id: contractId,
        tenantId: ctx.tenantId,
        associations: {
          some: { entityType: "crm_account", entityId: accountId },
        },
      },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Contrato no encontrado" },
        { status: 404 }
      );
    }

    const updateData: Record<string, any> = {};
    if (status !== undefined) updateData.status = status;
    if (effectiveDate !== undefined)
      updateData.effectiveDate = effectiveDate ? new Date(effectiveDate) : null;
    if (expirationDate !== undefined)
      updateData.expirationDate = expirationDate ? new Date(expirationDate) : null;
    if (alertDaysBefore !== undefined)
      updateData.alertDaysBefore = alertDaysBefore;
    if (portalVisible !== undefined) updateData.portalVisible = portalVisible;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.document.update({
        where: { id: contractId },
        data: updateData,
      });

      await tx.docHistory.create({
        data: {
          documentId: contractId,
          action: "updated",
          details: { fields: Object.keys(updateData), values: updateData },
          createdBy: ctx.userId,
        },
      });

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating contract:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar contrato" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/crm/accounts/[id]/contracts/[contractId]
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const modCheck = await requireTenantModule('crm');
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmDelete(ctx, "accounts");
  if (forbidden) return forbidden;

  const { id: accountId, contractId } = await params;

  try {
    // Verify ownership
    const doc = await prisma.document.findFirst({
      where: {
        id: contractId,
        tenantId: ctx.tenantId,
        associations: {
          some: { entityType: "crm_account", entityId: accountId },
        },
      },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Contrato no encontrado" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.docAssociation.deleteMany({ where: { documentId: contractId } });
      await tx.docHistory.deleteMany({ where: { documentId: contractId } });
      await tx.docSignatureRecipient.deleteMany({
        where: { request: { documentId: contractId } },
      });
      await tx.docSignatureRequest.deleteMany({
        where: { documentId: contractId },
      });
      await tx.document.delete({ where: { id: contractId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting contract:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar contrato" },
      { status: 500 }
    );
  }
}
