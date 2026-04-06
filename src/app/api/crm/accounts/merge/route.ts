/**
 * API Route: /api/crm/accounts/merge
 * POST - Fusionar dos cuentas: reasignar registros al master y eliminar el duplicado.
 *        Soporta fieldOverrides (campos del dup a sobrescribir en master)
 *        y excludeIds (registros del dup que NO se mueven).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { requireTenantModule } from '@/lib/require-module';

type MergeBody = {
  masterId: string;
  duplicateId: string;
  // Campos del duplicado que queremos copiar al master (sobrescriben)
  fieldOverrides?: Partial<{
    name: string;
    rut: string;
    legalName: string;
    legalRepresentativeName: string;
    legalRepresentativeRut: string;
    notaryName: string;
    notaryDate: string;
    industry: string;
    segment: string;
    website: string;
    address: string;
    commune: string;
    notes: string;
    startDate: string;
    endDate: string;
  }>;
  // IDs de registros del duplicado que NO deben moverse al master (se eliminan)
  excludeContactIds?: string[];
  excludeDealIds?: string[];
  excludeInstallationIds?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body: MergeBody = await request.json();
    const {
      masterId,
      duplicateId,
      fieldOverrides = {},
      excludeContactIds = [],
      excludeDealIds = [],
      excludeInstallationIds = [],
    } = body;

    if (!masterId || !duplicateId) {
      return NextResponse.json(
        { success: false, error: "masterId y duplicateId son requeridos" },
        { status: 400 }
      );
    }
    if (masterId === duplicateId) {
      return NextResponse.json(
        { success: false, error: "No puedes fusionar una cuenta consigo misma" },
        { status: 400 }
      );
    }

    // Validar ambas cuentas
    const [master, duplicate] = await Promise.all([
      prisma.crmAccount.findFirst({ where: { id: masterId, tenantId: ctx.tenantId } }),
      prisma.crmAccount.findFirst({
        where: { id: duplicateId, tenantId: ctx.tenantId },
        include: {
          _count: { select: { contacts: true, deals: true, installations: true } },
        },
      }),
    ]);

    if (!master) {
      return NextResponse.json({ success: false, error: "Cuenta master no encontrada" }, { status: 404 });
    }
    if (!duplicate) {
      return NextResponse.json({ success: false, error: "Cuenta duplicada no encontrada" }, { status: 404 });
    }

    const dupCounts = (duplicate as any)._count;

    // Construir data de actualización del master con los overrides del duplicado
    const masterUpdateData: Record<string, unknown> = {};
    const allowedOverrideFields = [
      "name", "rut", "legalName", "legalRepresentativeName", "legalRepresentativeRut",
      "notaryName", "notaryDate", "industry", "segment", "website", "address",
      "commune", "notes", "startDate", "endDate",
    ];
    for (const field of allowedOverrideFields) {
      const val = (fieldOverrides as Record<string, unknown>)[field];
      if (val !== undefined && val !== null && val !== "") {
        masterUpdateData[field] = val;
      }
    }

    await prisma.$transaction(async (tx) => {
      // 0. Aplicar overrides de campos al master
      if (Object.keys(masterUpdateData).length > 0) {
        await tx.crmAccount.updateMany({
          where: { id: masterId, tenantId: ctx.tenantId },
          data: masterUpdateData,
        });
      }

      // 1. Reasignar contactos (excluyendo los que el usuario marcó para eliminar)
      if (excludeContactIds.length > 0) {
        // Eliminar los contactos excluidos del duplicado
        await tx.crmContact.deleteMany({
          where: { accountId: duplicateId, id: { in: excludeContactIds }, tenantId: ctx.tenantId },
        });
      }
      await tx.crmContact.updateMany({
        where: {
          accountId: duplicateId,
          tenantId: ctx.tenantId,
          ...(excludeContactIds.length > 0 ? { id: { notIn: excludeContactIds } } : {}),
        },
        data: { accountId: masterId },
      });

      // 2. Reasignar negocios
      if (excludeDealIds.length > 0) {
        await tx.crmDeal.deleteMany({
          where: { accountId: duplicateId, id: { in: excludeDealIds }, tenantId: ctx.tenantId },
        });
      }
      await tx.crmDeal.updateMany({
        where: {
          accountId: duplicateId,
          tenantId: ctx.tenantId,
          ...(excludeDealIds.length > 0 ? { id: { notIn: excludeDealIds } } : {}),
        },
        data: { accountId: masterId },
      });

      // 3. Reasignar instalaciones
      if (excludeInstallationIds.length > 0) {
        await tx.crmInstallation.deleteMany({
          where: { accountId: duplicateId, id: { in: excludeInstallationIds }, tenantId: ctx.tenantId },
        });
      }
      await tx.crmInstallation.updateMany({
        where: {
          accountId: duplicateId,
          tenantId: ctx.tenantId,
          ...(excludeInstallationIds.length > 0 ? { id: { notIn: excludeInstallationIds } } : {}),
        },
        data: { accountId: masterId },
      });

      // 4. Reasignar OpsRefuerzoSolicitud
      await tx.opsRefuerzoSolicitud.updateMany({
        where: { accountId: duplicateId, tenantId: ctx.tenantId },
        data: { accountId: masterId },
      });

      // 5. Reasignar OpsEncuestaCliente
      await tx.opsEncuestaCliente.updateMany({
        where: { accountId: duplicateId, tenantId: ctx.tenantId },
        data: { accountId: masterId },
      });

      // 6. Reasignar OpsVisitaTecnica
      await tx.opsVisitaTecnica.updateMany({
        where: { accountId: duplicateId, tenantId: ctx.tenantId },
        data: { accountId: masterId },
      });

      // 7. Reasignar representantes legales
      await tx.accountRepresentanteLegal.updateMany({
        where: { accountId: duplicateId, tenantId: ctx.tenantId },
        data: { accountId: masterId },
      });

      // 8. Manejar personería (unique por cuenta)
      const masterPersoneria = await tx.accountPersoneria.findFirst({
        where: { accountId: masterId, tenantId: ctx.tenantId },
      });
      const dupPersoneria = await tx.accountPersoneria.findFirst({
        where: { accountId: duplicateId, tenantId: ctx.tenantId },
      });
      if (dupPersoneria) {
        if (masterPersoneria) {
          await tx.accountPersoneria.delete({ where: { id: dupPersoneria.id } });
        } else {
          await tx.accountPersoneria.updateMany({
            where: { id: dupPersoneria.id, tenantId: ctx.tenantId },
            data: { accountId: masterId },
          });
        }
      }

      // 9. Actualizar accountId en CpqQuote (campo libre, no FK declarada)
      await tx.cpqQuote.updateMany({
        where: { tenantId: ctx.tenantId, accountId: duplicateId },
        data: { accountId: masterId },
      });

      // 10. Eliminar la cuenta duplicada
      await tx.crmAccount.delete({ where: { id: duplicateId } });
    }, { timeout: 30_000 });

    // Log en historial
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "account",
      entityId: masterId,
      action: "account_merged",
      details: {
        mergedFrom: duplicate.name,
        mergedFromId: duplicateId,
        fieldOverridesApplied: Object.keys(masterUpdateData),
        excludedContacts: excludeContactIds.length,
        excludedDeals: excludeDealIds.length,
        excludedInstallations: excludeInstallationIds.length,
        recordsMoved: {
          contacts: (dupCounts?.contacts ?? 0) - excludeContactIds.length,
          deals: (dupCounts?.deals ?? 0) - excludeDealIds.length,
          installations: (dupCounts?.installations ?? 0) - excludeInstallationIds.length,
        },
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({
      success: true,
      message: `Cuenta "${duplicate.name}" fusionada en "${master.name}" exitosamente`,
    });
  } catch (error) {
    console.error("Error fusionando cuentas:", error);
    return NextResponse.json(
      { success: false, error: "Error al fusionar las cuentas" },
      { status: 500 }
    );
  }
}
