/**
 * API Route: /api/cpq/quotes/[id]/services/[groupId]/clone
 * POST - Duplica un servicio (grupo) con TODOS sus turnos (posiciones).
 *
 * El grupo nuevo conserva icono / color / patrón y se nombra "<nombre> (copia)".
 * Cada posición se clona preservando sus campos (cargo, rol, horario, sueldo,
 * snapshot de payroll) y apuntando al nuevo grupo.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";
import { createCrmHistoryLog } from "@/lib/crm-history";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  try {
    const mod = await requireTenantModule("cpq");
    if (!mod.authorized) return mod.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id, groupId } = await params;

    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });
    if (!quote) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 });
    }

    const source = await prisma.cpqServiceGroup.findFirst({
      where: { id: groupId, quoteId: id, tenantId: ctx.tenantId },
    });
    if (!source) {
      return NextResponse.json({ success: false, error: "Grupo no encontrado" }, { status: 404 });
    }

    const sourcePositions = await prisma.cpqPosition.findMany({
      where: { serviceGroupId: groupId, quoteId: id },
    });

    const lastOrder = await prisma.cpqServiceGroup.findFirst({
      where: { quoteId: id, tenantId: ctx.tenantId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });
    const nextOrder = (lastOrder?.displayOrder ?? -1) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.cpqServiceGroup.create({
        data: {
          tenantId: ctx.tenantId,
          quoteId: id,
          name: `${source.name} (copia)`,
          coveragePattern: source.coveragePattern,
          iconName: source.iconName,
          colorHex: source.colorHex,
          notes: source.notes,
          displayOrder: nextOrder,
        },
      });

      for (const pos of sourcePositions) {
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...posData } = pos;
        await tx.cpqPosition.create({
          data: {
            ...posData,
            serviceGroupId: group.id,
            payrollSnapshot:
              posData.payrollSnapshot === null
                ? Prisma.JsonNull
                : (posData.payrollSnapshot as Prisma.InputJsonValue),
          },
        });
      }

      return group;
    });

    await refreshQuoteTotals(id);
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_service_group_cloned",
      details: {
        quoteCode: quote.code,
        sourceServiceGroupId: groupId,
        clonedServiceGroupId: created.id,
        name: created.name,
        positionsCloned: sourcePositions.length,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error cloning CPQ service group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clone service group" },
      { status: 500 }
    );
  }
}
