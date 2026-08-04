import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit, requireCrmView } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";

/**
 * Gestión del FinanceCashflowItem vinculado a un contrato PDF (Document).
 *
 * Relación: FinanceCashflowItem.sourceRefId = document.id, source=CONTRACT,
 * categoría ING_VENTA_CONTRATO. Cada contrato puede tener cero o un item.
 *
 * Expone/acepta monto, moneda, vigencia e IPC. El calendario de emisión
 * y cobro vive en FinanceDteRecurringTemplate (programaciones).
 */

const upsertSchema = z.object({
  itemId: z.string().uuid().optional(),
  installationId: z.string().uuid().nullable().optional(),
  monthlyAmount: z.number().positive(),
  currency: z.enum(["CLP", "UF"]).optional().default("CLP"),
  paymentDay: z.number().int().min(-1).max(31),
  startDate: z.string().min(1, "Fecha de inicio requerida"),
  endDate: z.string().nullable().optional(),
  hasIpcAdjustment: z.boolean().optional(),
  ipcAdjustmentMonths: z.number().int().min(1).max(36).nullable().optional(),
  ipcStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD")
    .nullable()
    .optional(),
  nickname: z.string().max(100).nullable().optional(),
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
      source: { in: ["CONTRACT", "OTHER"] },
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
      ipcStartDate: true,
      nickname: true,
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
            ipcStartDate: item.ipcStartDate,
            nickname: item.nickname,
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

  let existing: { id: string } | null = null;
  if (data.itemId) {
    existing = await prisma.financeCashflowItem.findFirst({
      where: {
        id: data.itemId,
        tenantId: ctx.tenantId,
        source: { in: ["CONTRACT", "OTHER"] },
        sourceRefId: contractId,
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Item no encontrado o no pertenece al contrato",
        },
        { status: 404 },
      );
    }
  }

  const itemData = {
    tenantId: ctx.tenantId,
    categoryId: cat.id,
    kind: "INCOME" as const,
    source: "CONTRACT" as const,
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
    hasIpcAdjustment:
      data.currency === "CLP" ? !!data.hasIpcAdjustment : false,
    ipcAdjustmentMonths:
      data.currency === "CLP" && data.hasIpcAdjustment
        ? data.ipcAdjustmentMonths ?? 12
        : null,
    ipcStartDate:
      data.currency === "CLP" && data.hasIpcAdjustment && data.ipcStartDate
        ? new Date(data.ipcStartDate)
        : null,
    ...(data.nickname !== undefined && { nickname: data.nickname }),
  };

  let itemId: string;
  if (existing) {
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

  let specificItemId: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.itemId === "string") specificItemId = body.itemId;
  } catch {
    // body vacío o no-JSON → sin itemId específico
  }

  const items = await prisma.financeCashflowItem.findMany({
    where: specificItemId
      ? { tenantId: ctx.tenantId, id: specificItemId, sourceRefId: contractId }
      : { tenantId: ctx.tenantId, source: { in: ["CONTRACT", "OTHER"] }, sourceRefId: contractId },
    select: { id: true },
  });

  if (items.length === 0) {
    return NextResponse.json({ success: true, data: { action: "noop" } });
  }

  const itemIds = items.map((i) => i.id);

  await prisma.financeCashflowItem.updateMany({
    where: { id: { in: itemIds } },
    data: { isActive: false },
  });
  await prisma.financeCashflowOccurrence.deleteMany({
    where: {
      tenantId: ctx.tenantId,
      itemId: { in: itemIds },
      status: "PROJECTED",
    },
  });

  return NextResponse.json({
    success: true,
    data: { itemIds, action: "deactivated" },
  });
}
