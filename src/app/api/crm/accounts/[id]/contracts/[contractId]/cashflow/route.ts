import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit, requireCrmView } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";

/**
 * Gestión del FinanceCashflowItem vinculado a un contrato PDF (Document).
 *
 * Relación: FinanceCashflowItem.sourceRefId = document.id, source=OTHER,
 * categoría ING_VENTA_CONTRATO. Cada contrato puede tener cero o un item.
 *
 * Un cliente (CrmAccount) puede tener N contratos, y cada uno
 * potencialmente vincularse a una instalación distinta con monto y día de
 * pago propios. Este endpoint permite gestionar esa vinculación por
 * contrato sin afectar a los demás.
 */

const upsertSchema = z.object({
  installationId: z.string().uuid().nullable().optional(),
  /// Monto mensual en la moneda especificada en `currency` (CLP o UF). Si
  /// UF, el valor se persiste tal cual (ej. 117.94) y la conversión a CLP
  /// la hace la capa de proyección con la UF del día.
  monthlyAmount: z.number().positive(),
  currency: z.enum(["CLP", "UF"]).optional().default("CLP"),
  paymentDay: z.number().int().min(-1).max(31),
  startDate: z.string().min(1, "Fecha de inicio requerida"),
  endDate: z.string().nullable().optional(),
  // Fase E — IPC adjustment metadata
  hasIpcAdjustment: z.boolean().optional(),
  ipcAdjustmentMonths: z.number().int().min(1).max(36).nullable().optional(),
});

async function loadContractAndCheck(
  tenantId: string,
  accountId: string,
  contractId: string,
) {
  const document = await prisma.document.findFirst({
    where: {
      id: contractId,
      tenantId,
      associations: {
        some: { entityType: "crm_account", entityId: accountId },
      },
    },
    select: { id: true, title: true, effectiveDate: true, expirationDate: true },
  });
  return document;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmView(ctx, "accounts");
  if (forbidden) return forbidden;

  const { id: accountId, contractId } = await params;

  const document = await loadContractAndCheck(ctx.tenantId, accountId, contractId);
  if (!document) {
    return NextResponse.json(
      { success: false, error: "Contrato no encontrado" },
      { status: 404 },
    );
  }

  const item = await prisma.financeCashflowItem.findFirst({
    where: {
      tenantId: ctx.tenantId,
      source: "OTHER",
      sourceRefId: contractId,
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      dayOfMonth: true,
      startDate: true,
      endDate: true,
      installationId: true,
      isActive: true,
      hasIpcAdjustment: true,
      ipcAdjustmentMonths: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      document: {
        id: document.id,
        title: document.title,
        effectiveDate: document.effectiveDate,
        expirationDate: document.expirationDate,
      },
      cashflowItem: item
        ? {
            id: item.id,
            // El campo es el monto en su moneda nativa (CLP o UF). Se
            // mantiene `amountClp` como alias por compatibilidad con
            // ContractCashflowDialog/AccountContractsSection.
            amountClp: Number(item.amount),
            monthlyAmount: Number(item.amount),
            currency: item.currency,
            dayOfMonth: item.dayOfMonth,
            startDate: item.startDate,
            endDate: item.endDate,
            installationId: item.installationId,
            isActive: item.isActive,
            hasIpcAdjustment: item.hasIpcAdjustment,
            ipcAdjustmentMonths: item.ipcAdjustmentMonths,
          }
        : null,
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx, "accounts");
  if (forbidden) return forbidden;

  const { id: accountId, contractId } = await params;
  const document = await loadContractAndCheck(ctx.tenantId, accountId, contractId);
  if (!document) {
    return NextResponse.json(
      { success: false, error: "Contrato no encontrado" },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Datos inválidos",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const cat = await prisma.financeCashflowCategory.findFirst({
    where: {
      tenantId: ctx.tenantId,
      code: "ING_VENTA_CONTRATO",
      isActive: true,
    },
    select: { id: true },
  });
  if (!cat) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Categoría ING_VENTA_CONTRATO no inicializada en cashflow del tenant",
      },
      { status: 400 },
    );
  }

  const dom =
    data.paymentDay === -1 ? -1 : Math.min(Math.max(data.paymentDay, 1), 28);
  const installationId = data.installationId ?? null;

  // Update si ya existe; create si no. El sourceRefId apunta al document.
  const existing = await prisma.financeCashflowItem.findFirst({
    where: {
      tenantId: ctx.tenantId,
      source: "OTHER",
      sourceRefId: contractId,
    },
    select: { id: true },
  });

  const itemData = {
    tenantId: ctx.tenantId,
    categoryId: cat.id,
    kind: "INCOME" as const,
    source: "OTHER" as const,
    sourceRefId: contractId,
    name: document.title,
    description: `Contrato ${document.title}`,
    amount: data.monthlyAmount,
    currency: data.currency,
    recurrence: "MONTHLY" as const,
    dayOfMonth: dom,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    installationId,
    crmAccountId: accountId,
    isActive: true,
    // Fase E — IPC sólo aplica a CLP. Si el item es UF, ignoramos.
    hasIpcAdjustment:
      data.currency === "CLP" ? !!data.hasIpcAdjustment : false,
    ipcAdjustmentMonths:
      data.currency === "CLP" && data.hasIpcAdjustment
        ? data.ipcAdjustmentMonths ?? 12
        : null,
  };

  let itemId: string;
  if (existing) {
    // Si cambia el monto / fechas, las occurrences PROJECTED quedan stale
    // (amountClp congelado). Las limpiamos para que se regeneren.
    await prisma.financeCashflowOccurrence.deleteMany({
      where: {
        tenantId: ctx.tenantId,
        itemId: existing.id,
        status: "PROJECTED",
      },
    });
    await prisma.financeCashflowItem.update({
      where: { id: existing.id },
      data: itemData,
    });
    itemId = existing.id;
  } else {
    const created = await prisma.financeCashflowItem.create({
      data: { ...itemData, createdBy: ctx.userId ?? undefined },
    });
    itemId = created.id;
  }

  return NextResponse.json({
    success: true,
    data: { itemId, action: existing ? "updated" : "created" },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx, "accounts");
  if (forbidden) return forbidden;

  const { id: accountId, contractId } = await params;
  const document = await loadContractAndCheck(ctx.tenantId, accountId, contractId);
  if (!document) {
    return NextResponse.json(
      { success: false, error: "Contrato no encontrado" },
      { status: 404 },
    );
  }

  const existing = await prisma.financeCashflowItem.findFirst({
    where: {
      tenantId: ctx.tenantId,
      source: "OTHER",
      sourceRefId: contractId,
    },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: true, data: { action: "noop" } });
  }

  // Soft delete: marcar inactivo. Preserva occurrences pagadas/conciliadas
  // que podrían tener history bancario, y permite reactivar después.
  await prisma.financeCashflowItem.update({
    where: { id: existing.id },
    data: { isActive: false },
  });
  await prisma.financeCashflowOccurrence.deleteMany({
    where: {
      tenantId: ctx.tenantId,
      itemId: existing.id,
      status: "PROJECTED",
    },
  });

  return NextResponse.json({
    success: true,
    data: { itemId: existing.id, action: "deactivated" },
  });
}
