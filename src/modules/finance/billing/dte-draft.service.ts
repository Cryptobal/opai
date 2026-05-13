/**
 * DTE Draft Service
 *
 * Borradores editables (siiStatus=DRAFT) que NO llaman al provider, NO
 * reservan folio CAF y NO generan asiento contable. Folio = 0 mientras es
 * DRAFT (la unicidad real es vía partial unique index que excluye DRAFT).
 *
 * Al "emitir" un borrador se llama a issueDte() con sus datos y, en éxito,
 * el borrador se elimina (su id no se preserva: el DTE emitido es nuevo).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { isDteTypeValid } from "../shared/constants/dte-types";
import { issueDte, type IssueDteInput } from "./dte-issuer.service";
import { computeDteAmounts } from "./dte-amounts.helper";
import {
  matchDraftToOccurrence,
  rebindDraftOccurrencesToIssued,
} from "@/modules/finance/cashflow/draft-occurrence-matcher.service";

const DRAFT_REQUIRED_REFERENCE = [56, 61] as const;

/**
 * Mismo shape que IssueDteInput pero con receiver* opcionales: el usuario
 * puede ir guardando borradores con datos parciales antes de completar
 * todo. La validación dura corre al emitir el draft (issueDraftDte).
 */
export type DraftDteInput = Omit<IssueDteInput, "receiverRut" | "receiverName"> & {
  receiverRut?: string;
  receiverName?: string;
  // Plan de Documento de Cobro: configurado por el usuario al crear/editar
  // el borrador. No es parte del IssueDte — el SII no sabe nada de esto;
  // es metadata interna que controla el envío de Proforma / Estado de Pago.
  requireProforma?: boolean;
  proformaRecipientContactIds?: string[];
  requireEstadoPago?: boolean;
  estadoPagoRecipientContactIds?: string[];
};

/**
 * Crea un borrador (FinanceDte siiStatus=DRAFT). NO llama al provider,
 * NO reserva folio. Permite receptor parcial — la validación dura se
 * aplica recién al emitir.
 */
export async function createDraftDte(
  tenantId: string,
  createdBy: string,
  input: DraftDteInput,
  opts?: { ufOverride?: number },
) {
  if (!isDteTypeValid(input.dteType)) {
    throw new Error(`Tipo de DTE ${input.dteType} no es valido`);
  }

  // strict=false en draft: tolera unitPrice CLP con decimales para no
  // romper drafts existentes generados con la lógica vieja. La validación
  // estricta corre al emitir (issuer) — si el draft tiene drift, el
  // usuario lo verá al pasar por el preview antes de emitir.
  // ufOverride: si se pasa, se usa esa UF (en vez de la del día). Lo
  // usa la facturación recurrente con UF policy distinta de RUN_DAY.
  const calc = await computeDteAmounts(input, {
    strict: false,
    ufOverride: opts?.ufOverride,
  });

  const draft = await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "ISSUED",
      dteType: input.dteType,
      folio: 0,
      code: `DRAFT-${randomUUID().slice(0, 8)}`,
      date: new Date(),
      issuerRut: "",
      issuerName: "",
      receiverRut: input.receiverRut ?? "",
      receiverName: input.receiverName ?? "",
      receiverEmail: input.receiverEmail ?? null,
      receiverEmailCc: input.receiverEmailCc ?? [],
      receiverGiro: input.receiverGiro ?? null,
      receiverDireccion: input.receiverDireccion ?? null,
      receiverComuna: input.receiverComuna ?? null,
      receiverCiudad: input.receiverCiudad ?? null,
      crmAccountId: input.crmAccountId ?? null,
      installationId: input.installationId ?? null,
      currency: (input.currency as Prisma.FinanceDteCreateInput["currency"]) ?? "CLP",
      exchangeRate: calc.ufValue ?? null,
      ufValueAtIssue: calc.ufValue ?? null,
      ufDateAtIssue: calc.ufDate ?? null,
      netAmount: calc.totalNet,
      exemptAmount: calc.totalExempt,
      taxRate: calc.taxRate,
      taxAmount: calc.taxAmount,
      totalAmount: calc.totalAmount,
      siiStatus: "DRAFT",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: calc.totalAmount,
      accountId: input.accountId ?? null,
      createdBy,
      notes: input.notes ?? null,
      referenceDteId: input.reference?.docId ?? null,
      referenceType: input.reference?.type ?? null,
      referenceFolio: input.reference?.folio ?? null,
      referenceDate: input.reference?.date ? new Date(input.reference.date) : null,
      referenceCode: input.reference?.code ?? null,
      referenceReason: input.reference?.reason ?? null,
      additionalReferences:
        input.additionalReferences && input.additionalReferences.length > 0
          ? (input.additionalReferences as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      // Plan de Documento de Cobro (Proforma / Estado de Pago).
      requireProforma: input.requireProforma ?? false,
      proformaRecipientContactIds: input.proformaRecipientContactIds ?? [],
      requireEstadoPago: input.requireEstadoPago ?? false,
      estadoPagoRecipientContactIds: input.estadoPagoRecipientContactIds ?? [],
      lines: {
        create: calc.lines.map((l, i) => ({
          lineNumber: i + 1,
          itemCode: l.itemCode ?? null,
          itemName: l.itemName,
          description: l.description ?? null,
          quantity: l.quantity,
          unit: l.unit ?? null,
          unitPrice: l.unitPrice,
          unitPriceUf: l.unitPriceUf ?? null,
          discountPct: l.discountPct ?? 0,
          netAmount: l.netAmount,
          isExempt: l.isExempt ?? false,
          accountId: l.accountId ?? null,
          costCenterId: l.costCenterId ?? null,
          refuerzoSolicitudId: l.refuerzoSolicitudId ?? null,
        })),
      },
    },
    include: { lines: true },
  });

  // Auto-match con flujo de caja (best effort, no romper si falla).
  try {
    await matchDraftToOccurrence({
      tenantId,
      dteId: draft.id,
      crmAccountId: draft.crmAccountId,
      installationId: draft.installationId,
      expectedDate: draft.date,
      amountClp: Number(draft.totalAmount),
    });
  } catch (err) {
    console.error("[dte-draft] auto-match falló (no bloqueante):", err);
  }

  return draft;
}

export async function updateDraftDte(
  tenantId: string,
  draftId: string,
  input: DraftDteInput,
  opts?: { ufOverride?: number },
) {
  const existing = await prisma.financeDte.findFirst({
    where: { id: draftId, tenantId, siiStatus: "DRAFT" },
    select: { id: true },
  });
  if (!existing) throw new Error("Borrador no encontrado o ya emitido");

  // Mismo tratamiento que createDraftDte: tolerante en update para no
  // romper drafts viejos. Validación estricta corre al emitir.
  const calc = await computeDteAmounts(input, {
    strict: false,
    ufOverride: opts?.ufOverride,
  });

  return prisma.$transaction(async (tx) => {
    await tx.financeDteLine.deleteMany({ where: { dteId: draftId } });
    return tx.financeDte.update({
      where: { id: draftId },
      data: {
        dteType: input.dteType,
        receiverRut: input.receiverRut ?? "",
        receiverName: input.receiverName ?? "",
        receiverEmail: input.receiverEmail ?? null,
        receiverEmailCc: input.receiverEmailCc ?? [],
        receiverGiro: input.receiverGiro ?? null,
        receiverDireccion: input.receiverDireccion ?? null,
        receiverComuna: input.receiverComuna ?? null,
        receiverCiudad: input.receiverCiudad ?? null,
        crmAccountId: input.crmAccountId ?? null,
        installationId: input.installationId ?? null,
        currency: (input.currency as Prisma.FinanceDteCreateInput["currency"]) ?? "CLP",
        exchangeRate: calc.ufValue ?? null,
        ufValueAtIssue: calc.ufValue ?? null,
        ufDateAtIssue: calc.ufDate ?? null,
        netAmount: calc.totalNet,
        exemptAmount: calc.totalExempt,
        taxRate: calc.taxRate,
        taxAmount: calc.taxAmount,
        totalAmount: calc.totalAmount,
        amountPending: calc.totalAmount,
        notes: input.notes ?? null,
        referenceDteId: input.reference?.docId ?? null,
        referenceType: input.reference?.type ?? null,
        referenceFolio: input.reference?.folio ?? null,
        referenceDate: input.reference?.date ? new Date(input.reference.date) : null,
        referenceCode: input.reference?.code ?? null,
        referenceReason: input.reference?.reason ?? null,
        additionalReferences:
          input.additionalReferences && input.additionalReferences.length > 0
            ? (input.additionalReferences as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        // Plan de Documento de Cobro (mismo tratamiento que create).
        requireProforma: input.requireProforma ?? false,
        proformaRecipientContactIds: input.proformaRecipientContactIds ?? [],
        requireEstadoPago: input.requireEstadoPago ?? false,
        estadoPagoRecipientContactIds: input.estadoPagoRecipientContactIds ?? [],
        lines: {
          create: calc.lines.map((l, i) => ({
            lineNumber: i + 1,
            itemCode: l.itemCode ?? null,
            itemName: l.itemName,
            description: l.description ?? null,
            quantity: l.quantity,
            unit: l.unit ?? null,
            unitPrice: l.unitPrice,
            unitPriceUf: l.unitPriceUf ?? null,
            discountPct: l.discountPct ?? 0,
            netAmount: l.netAmount,
            isExempt: l.isExempt ?? false,
            accountId: l.accountId ?? null,
            costCenterId: l.costCenterId ?? null,
            refuerzoSolicitudId: l.refuerzoSolicitudId ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  });
}

export async function deleteDraftDte(tenantId: string, draftId: string) {
  const existing = await prisma.financeDte.findFirst({
    where: { id: draftId, tenantId, siiStatus: "DRAFT" },
    select: { id: true },
  });
  if (!existing) throw new Error("Borrador no encontrado o ya emitido");
  await prisma.financeDte.delete({ where: { id: draftId } });
}

/**
 * Promueve un borrador a DTE emitido. Llama a issueDte() con los datos
 * persistidos. Si la emisión falla, el borrador queda intacto. En éxito,
 * el borrador se elimina (su id no se preserva: el DTE real es nuevo
 * con folio asignado y siiStatus=PENDING).
 */
export async function issueDraftDte(
  tenantId: string,
  draftId: string,
  issuedBy: string,
  overrides?: {
    autoSendEmail?: boolean;
    sendXmlToBackoffice?: boolean;
    backofficeEmailsOverride?: string[];
    /** UF a usar en lugar de la del día. Si no viene y el draft tiene
     * `ufValueAtIssue`, se usa esa (asumimos que es la UF que el usuario
     * dejó pactada). Para forzar la UF del día, pasar `ufOverride: undefined`
     * y borrar `ufValueAtIssue` antes en el draft. */
    ufOverride?: number;
  },
) {
  const draft = await prisma.financeDte.findFirst({
    where: { id: draftId, tenantId, siiStatus: "DRAFT" },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!draft) throw new Error("Borrador no encontrado o ya emitido");
  if (!draft.receiverRut?.trim()) throw new Error("Borrador requiere RUT del receptor");
  if (!draft.receiverName?.trim()) throw new Error("Borrador requiere razón social del receptor");
  if (DRAFT_REQUIRED_REFERENCE.includes(draft.dteType as 56 | 61)) {
    if (!draft.referenceFolio || !draft.referenceType || !draft.referenceDate || !draft.referenceCode) {
      throw new Error(`Tipo ${draft.dteType} (NC/ND) requiere referencia al DTE original`);
    }
  }

  const input: IssueDteInput = {
    dteType: draft.dteType,
    receiverRut: draft.receiverRut,
    receiverName: draft.receiverName,
    receiverEmail: draft.receiverEmail ?? undefined,
    receiverEmailCc: draft.receiverEmailCc,
    receiverGiro: draft.receiverGiro ?? undefined,
    receiverDireccion: draft.receiverDireccion ?? undefined,
    receiverComuna: draft.receiverComuna ?? undefined,
    receiverCiudad: draft.receiverCiudad ?? undefined,
    crmAccountId: draft.crmAccountId ?? undefined,
    installationId: draft.installationId ?? undefined,
    currency: draft.currency,
    notes: draft.notes ?? undefined,
    accountId: draft.accountId ?? undefined,
    autoSendEmail: overrides?.autoSendEmail,
    sendXmlToBackoffice: overrides?.sendXmlToBackoffice,
    backofficeEmailsOverride: overrides?.backofficeEmailsOverride,
    lines: draft.lines.map((l) => ({
      itemCode: l.itemCode ?? undefined,
      itemName: l.itemName,
      description: l.description ?? undefined,
      quantity: l.quantity.toNumber(),
      unit: l.unit ?? undefined,
      unitPrice: l.unitPrice.toNumber(),
      unitPriceUf: l.unitPriceUf?.toNumber(),
      discountPct: l.discountPct.toNumber(),
      isExempt: l.isExempt,
      accountId: l.accountId ?? undefined,
      costCenterId: l.costCenterId ?? undefined,
      refuerzoSolicitudId: l.refuerzoSolicitudId ?? undefined,
    })),
    reference:
      draft.referenceType && draft.referenceFolio && draft.referenceDate && draft.referenceCode
        ? {
            docId: draft.referenceDteId ?? undefined,
            type: draft.referenceType,
            folio: draft.referenceFolio,
            date: draft.referenceDate.toISOString().split("T")[0],
            code: draft.referenceCode as 1 | 2 | 3,
            reason: draft.referenceReason ?? "",
          }
        : undefined,
    additionalReferences: (draft.additionalReferences as IssueDteInput["additionalReferences"]) ?? undefined,
  };

  // ufOverride: priorizamos el override explícito; si no viene, usamos la
  // UF que quedó persistida en el draft (`ufValueAtIssue`) — esa es la UF
  // que el usuario "fijó" al guardar (sea por valor manual o por la UF del
  // día en que se creó). Si tampoco hay, el issuer usa la UF del día actual.
  const ufOverride = overrides?.ufOverride
    ?? (draft.currency === "UF" && draft.ufValueAtIssue
        ? Number(draft.ufValueAtIssue)
        : undefined);

  const issued = await issueDte(tenantId, issuedBy, input, { ufOverride });

  // Reasignar occurrences que apuntaban al draft → al nuevo DTE emitido,
  // antes de borrar el draft (la FK es ON DELETE SET NULL, pero queremos
  // preservar el vínculo en el flujo de caja).
  try {
    await rebindDraftOccurrencesToIssued(tenantId, draftId, issued.id);
  } catch (err) {
    console.error("[dte-draft] rebind a issued falló (no bloqueante):", err);
  }

  // Borrar el borrador solo tras éxito de issueDte. Si falla arriba, el
  // throw burbujea y el borrador queda intacto para corrección manual.
  await prisma.financeDte.delete({ where: { id: draftId } });
  return issued;
}

export async function listDraftDtes(
  tenantId: string,
  opts: { page: number; pageSize: number; search?: string },
) {
  const where: Prisma.FinanceDteWhereInput = {
    tenantId,
    direction: "ISSUED",
    siiStatus: "DRAFT",
    ...(opts.search
      ? {
          OR: [
            { receiverName: { contains: opts.search, mode: "insensitive" } },
            { receiverRut: { contains: opts.search } },
          ],
        }
      : {}),
  };
  const [drafts, total] = await Promise.all([
    prisma.financeDte.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: opts.pageSize,
      skip: (opts.page - 1) * opts.pageSize,
      include: { lines: true },
    }),
    prisma.financeDte.count({ where }),
  ]);
  return { drafts, total };
}

