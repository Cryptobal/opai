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
 * Un cliente (CrmAccount) puede tener N contratos, y cada uno
 * potencialmente vincularse a una instalación distinta con monto y día de
 * pago propios. Este endpoint permite gestionar esa vinculación por
 * contrato sin afectar a los demás.
 *
 * Backwards compat: items creados antes del fix de tipificación tienen
 * source="OTHER". Las búsquedas de existing aceptan ambos sources
 * (`{ in: ["CONTRACT", "OTHER"] }`) y al hacer update se migran a
 * "CONTRACT" en place. Cuando todos los items legacy se hayan migrado,
 * podemos dropear el "OTHER" de las queries.
 */

const upsertSchema = z.object({
  /**
   * Si está presente, se hace UPDATE de ese item específico. Si está
   * ausente, se CREA un item nuevo. Permite múltiples items con la
   * misma installationId (caso de cliente con varios ciclos de cobro
   * por la misma instalación — ej. Transmat con dos contratos en la
   * misma instalación pero con monto/calendario distintos).
   *
   * Antes de Bloque 5 Fase 2 el upsert buscaba existing por
   * (sourceRefId, installationId), asumiendo "1 item por
   * contrato-instalación", lo que sobrescribía el monto del primero
   * cuando había dos items con la misma instalación.
   */
  itemId: z.string().uuid().optional(),
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
  /**
   * Ancla del calendario IPC. Si es null, el sistema usa `startDate` del
   * item (compat retroactiva). Independiente de la fecha de inicio del
   * contrato — útil cuando un contrato vigente desde hace años configura
   * IPC desde una fecha distinta.
   */
  ipcStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD")
    .nullable()
    .optional(),
  // ── Bloque 5 Fase 1 — Calendario de cobro por contrato ──
  // Aceptados acá para que el form individual del item (Fase 3) pueda
  // persistirlos. Si no vienen, se mantiene el default de la DB o el
  // valor previo del item.
  nickname: z.string().max(100).nullable().optional(),
  emiteProforma: z.boolean().optional(),
  diaEmisionProforma: z.number().int().min(-1).max(31).nullable().optional(),
  diasFacturaDesdeProforma: z.number().int().min(0).max(60).nullable().optional(),
  diaEmisionFactura: z.number().int().min(-1).max(31).nullable().optional(),
  mesFacturaRelativo: z.enum(["MISMO_MES", "MES_SIGUIENTE"]).optional(),
  modoCobro: z.enum(["DIRECTO", "FACTORING"]).optional(),
  diasCobroDesdeFactura: z.number().int().min(0).max(180).optional(),
  costoFactoringPct: z.number().min(0).max(20).nullable().optional(),
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
      // Acepta CONTRACT (nuevo) y OTHER (legacy pre-fix de tipificación)
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
      // Bloque 5 — calendario de cobro por contrato
      nickname: true,
      emiteProforma: true,
      diaEmisionProforma: true,
      diasFacturaDesdeProforma: true,
      diaEmisionFactura: true,
      mesFacturaRelativo: true,
      modoCobro: true,
      diasCobroDesdeFactura: true,
      costoFactoringPct: true,
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
            // Bloque 5 — calendario de cobro
            nickname: item.nickname,
            emiteProforma: item.emiteProforma,
            diaEmisionProforma: item.diaEmisionProforma,
            diasFacturaDesdeProforma: item.diasFacturaDesdeProforma,
            diaEmisionFactura: item.diaEmisionFactura,
            mesFacturaRelativo: item.mesFacturaRelativo,
            modoCobro: item.modoCobro,
            diasCobroDesdeFactura: item.diasCobroDesdeFactura,
            costoFactoringPct:
              item.costoFactoringPct != null ? Number(item.costoFactoringPct) : null,
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

  // Lookup del item a editar (Bloque 5 Fase 2).
  //
  // - Si el frontend manda `itemId`: editamos ESE item específico.
  //   Esto es lo que permite múltiples items con la misma
  //   installationId — sin esto, el lookup por (sourceRefId,
  //   installationId) asumía "1 item por contrato-instalación" y
  //   sobrescribía el monto del existente.
  //
  // - Si el frontend NO manda `itemId`: es CREACIÓN de un nuevo item.
  //   No buscamos existing — pasamos directo a create.
  //
  // Nota de compatibilidad: el frontend ya pasaba a guardar el
  // `itemId` del item editado en el state (`cfDialog.itemId`) — antes
  // de Fase 2 simplemente no lo mandaba en el body. Form viejo
  // (sin itemId en el body) → branch "no hay itemId → crear nuevo".
  // Decisión: cortar limpio en lugar de mantener el findFirst como
  // fallback, porque ese fallback re-introduce el bug de
  // sobre-escritura.
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
    // Tipificación correcta: contratos del CRM = source CONTRACT (no OTHER).
    // Si el existing es OTHER (legacy), el update siguiente lo migra a
    // CONTRACT in-place.
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
    // Fase E — IPC sólo aplica a CLP. Si el item es UF, ignoramos.
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
    // ── Bloque 5 Fase 1 — Calendario de cobro por contrato ──
    // Sólo seteamos los campos que el frontend mandó explícitamente.
    // Si no vienen (form viejo), el item conserva su valor previo en
    // el UPDATE o queda con el default de la DB en el CREATE.
    ...(data.nickname !== undefined && { nickname: data.nickname }),
    ...(data.emiteProforma !== undefined && {
      emiteProforma: data.emiteProforma,
    }),
    ...(data.diaEmisionProforma !== undefined && {
      diaEmisionProforma: data.diaEmisionProforma,
    }),
    ...(data.diasFacturaDesdeProforma !== undefined && {
      diasFacturaDesdeProforma: data.diasFacturaDesdeProforma,
    }),
    ...(data.diaEmisionFactura !== undefined && {
      diaEmisionFactura: data.diaEmisionFactura,
    }),
    ...(data.mesFacturaRelativo !== undefined && {
      mesFacturaRelativo: data.mesFacturaRelativo,
    }),
    ...(data.modoCobro !== undefined && { modoCobro: data.modoCobro }),
    ...(data.diasCobroDesdeFactura !== undefined && {
      diasCobroDesdeFactura: data.diasCobroDesdeFactura,
    }),
    ...(data.costoFactoringPct !== undefined && {
      costoFactoringPct: data.costoFactoringPct,
    }),
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

  // Opcional: itemId específico en el body para borrar sólo ese item.
  // Sin itemId → soft-delete de todos los items del contrato (backward compat).
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

  // Soft delete: marcar inactivo. Preserva occurrences pagadas/conciliadas.
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
