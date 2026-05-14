import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';
import { deactivateContractCashflowItems } from "@/modules/finance/cashflow/generators/sales-contract-sync";

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
    const {
      status,
      effectiveDate,
      expirationDate,
      alertDaysBefore,
      portalVisible,
      installationId,
      installationIds,
    } = body;

    // Multi-instalación: prefer N IDs si vienen. Si sólo viene el legacy
    // `installationId`, lo convertimos a array de 0/1 elementos.
    const wantsMultiUpdate =
      installationIds !== undefined || installationId !== undefined;
    const installationList: string[] = Array.isArray(installationIds)
      ? installationIds.filter((x): x is string => typeof x === "string")
      : installationId
        ? [installationId]
        : [];

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

      // Instalaciones vinculadas (Fase C — N:M). Borramos las asocs
      // anteriores y recreamos las que vienen. Si la lista es vacía,
      // queda el contrato sin instalaciones asociadas.
      if (wantsMultiUpdate) {
        await tx.docAssociation.deleteMany({
          where: { documentId: contractId, entityType: "crm_installation" },
        });
        if (installationList.length > 0) {
          await tx.docAssociation.createMany({
            data: installationList.map((instId) => ({
              documentId: contractId,
              entityType: "crm_installation" as const,
              entityId: instId,
              role: "related",
            })),
            skipDuplicates: true,
          });
        }
      }

      // Propagar fechas + instalación al FinanceCashflowItem vinculado.
      // Sin esto, si el usuario extiende el contrato el flujo de caja
      // sigue proyectando hasta la fecha vieja (bug histórico).
      if (
        updateData.effectiveDate !== undefined ||
        updateData.expirationDate !== undefined ||
        wantsMultiUpdate
      ) {
        const cashflowItem = await tx.financeCashflowItem.findFirst({
          where: {
            tenantId: ctx.tenantId,
            // Acepta CONTRACT (nuevo) y OTHER (legacy pre-fix tipificación)
            source: { in: ["CONTRACT", "OTHER"] },
            sourceRefId: contractId,
            isActive: true,
          },
          select: { id: true },
        });
        if (cashflowItem) {
          const itemUpdate: Record<string, unknown> = {};
          if (updateData.effectiveDate !== undefined) {
            itemUpdate.startDate = updateData.effectiveDate ?? new Date();
          }
          if (updateData.expirationDate !== undefined) {
            itemUpdate.endDate = updateData.expirationDate ?? null;
          }
          if (wantsMultiUpdate) {
            // Con 1 instalación, la pegamos al item para drill-down.
            // Con 0 ó ≥2, queda null (el item vive a nivel cuenta y la
            // UI lista las N instalaciones desde DocAssociation).
            itemUpdate.installationId =
              installationList.length === 1 ? installationList[0] : null;
          }
          await tx.financeCashflowItem.update({
            where: { id: cashflowItem.id },
            data: itemUpdate,
          });
        }
      }

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
      // Cascada al flujo de caja: el item del contrato se desactiva y sus
      // occurrences PROJECTED no conciliadas se borran. Las matcheadas a
      // banco/DTE quedan como historial. Debe ir ANTES del delete del
      // Document — el helper resuelve por sourceRefId = contractId.
      await deactivateContractCashflowItems(tx, ctx.tenantId, contractId);

      // Cascada a programaciones recurrentes (DTE): desactivamos (no borramos)
      // toda plantilla vinculada al contrato para preservar el historial de
      // FinanceDteRecurringRun.
      await tx.financeDteRecurringTemplate.updateMany({
        where: { tenantId: ctx.tenantId, contractDocumentId: contractId },
        data: { isActive: false },
      });

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
