import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const ACTIVE_CESSION_STATUSES = ["SUBMITTED", "APPROVED", "FUNDED", "COLLECTED", "CLOSED"] as const;

export interface ExternalCessionTermsInput {
  invoiceAmount: number;
  montoCesion: number;
  fechaCesion: string;
  fechaVencimiento: string;
}

export interface ExternalCessionTerms {
  invoiceAmount: number;
  montoCesion: number;
  plazoDias: number;
  advanceRate: number;
  advanceAmount: number;
  interestRate: number;
  interestAmount: number;
  commissionAmount: number;
  netAdvance: number;
  retentionAmount: number;
}

export interface ReconcileExternalCessionInput {
  tenantId: string;
  dteType: number;
  folio: number;
  cesionarioRut: string;
  cesionarioRazonSocial: string;
  cesionarioDireccion?: string | null;
  cesionarioEmail?: string | null;
  fechaCesion: string;
  fechaVencimiento: string;
  montoCesion?: number;
  aecTrackId?: string | null;
  cessionSiiStatus?: string | null;
  dteXml?: Buffer;
  aecXml?: Buffer;
  createdBy: string;
  submittedAt?: Date;
  approvedAt?: Date;
  notes?: string | null;
  evidence?: Record<string, unknown>;
}

export interface ReconcileExternalCessionResult {
  dteId: string;
  operationId: string;
  code: string;
  created: boolean;
}

export function calculateExternalCessionTerms(
  input: ExternalCessionTermsInput,
): ExternalCessionTerms {
  const invoiceAmount = round2(input.invoiceAmount);
  const montoCesion = round2(input.montoCesion);
  const cesionDate = new Date(`${input.fechaCesion}T00:00:00Z`);
  const vencDate = new Date(`${input.fechaVencimiento}T00:00:00Z`);
  const plazoDias = Math.max(
    1,
    Math.round((vencDate.getTime() - cesionDate.getTime()) / 86400000),
  );

  return {
    invoiceAmount,
    montoCesion,
    plazoDias,
    advanceRate: invoiceAmount > 0 ? round2((montoCesion / invoiceAmount) * 100) : 100,
    advanceAmount: montoCesion,
    interestRate: 0,
    interestAmount: 0,
    commissionAmount: 0,
    netAdvance: montoCesion,
    retentionAmount: round2(Math.max(invoiceAmount - montoCesion, 0)),
  };
}

export async function reconcileExternalCession(
  input: ReconcileExternalCessionInput,
): Promise<ReconcileExternalCessionResult> {
  const submittedAt = input.submittedAt ?? new Date(`${input.fechaCesion}T12:00:00Z`);
  const approvedAt = input.approvedAt ?? submittedAt;

  return prisma.$transaction(async (tx) => {
    const dte = await tx.financeDte.findFirst({
      where: {
        tenantId: input.tenantId,
        direction: "ISSUED",
        dteType: input.dteType,
        folio: input.folio,
      },
      select: {
        id: true,
        totalAmount: true,
        dteXml: true,
      },
    });
    if (!dte) {
      throw new Error(
        `No existe DTE emitido tipo ${input.dteType} folio ${input.folio} para el tenant ${input.tenantId}.`,
      );
    }

    const existing = await tx.financeFactoringOperation.findFirst({
      where: {
        tenantId: input.tenantId,
        dteId: dte.id,
        status: { in: [...ACTIVE_CESSION_STATUSES] },
      },
      select: { id: true, code: true },
    });

    const invoiceAmount = Number(dte.totalAmount);
    const montoCesion = input.montoCesion ?? invoiceAmount;
    const shouldMarkCeded = montoCesion >= invoiceAmount;
    const dteUpdate: { dteXml?: Uint8Array<ArrayBuffer>; paymentStatus?: "CEDED" } = {};
    if ((!dte.dteXml || dte.dteXml.length === 0) && input.dteXml) {
      dteUpdate.dteXml = toPrismaBytes(input.dteXml);
    }
    if (shouldMarkCeded) {
      dteUpdate.paymentStatus = "CEDED";
    }

    if (Object.keys(dteUpdate).length > 0) {
      await tx.financeDte.update({
        where: { id: dte.id },
        data: dteUpdate,
      });
    }

    if (existing) {
      return {
        dteId: dte.id,
        operationId: existing.id,
        code: existing.code,
        created: false,
      };
    }

    const factoringCompany = await tx.financeFactoringCompany.findFirst({
      where: {
        tenantId: input.tenantId,
        rut: normalizeRut(input.cesionarioRut),
      },
      select: { id: true, razonSocial: true, direccion: true, email: true },
    });

    const code = await generateOperationCode(tx, input.tenantId, submittedAt);
    const terms = calculateExternalCessionTerms({
      invoiceAmount,
      montoCesion,
      fechaCesion: input.fechaCesion,
      fechaVencimiento: input.fechaVencimiento,
    });

    const op = await tx.financeFactoringOperation.create({
      data: {
        tenantId: input.tenantId,
        code,
        dteId: dte.id,
        factoringCompany:
          factoringCompany?.razonSocial ?? input.cesionarioRazonSocial,
        factoringCompanyId: factoringCompany?.id ?? null,
        cesionarioRut: input.cesionarioRut,
        cesionarioRazonSoc: input.cesionarioRazonSocial,
        cesionarioEmail: input.cesionarioEmail ?? factoringCompany?.email ?? null,
        cesionarioDireccion:
          input.cesionarioDireccion ?? factoringCompany?.direccion ?? null,
        invoiceAmount: terms.invoiceAmount,
        montoCesion: terms.montoCesion,
        plazoDias: terms.plazoDias,
        fechaCesion: new Date(`${input.fechaCesion}T00:00:00Z`),
        fechaVencimiento: new Date(`${input.fechaVencimiento}T00:00:00Z`),
        advanceRate: terms.advanceRate,
        advanceAmount: terms.advanceAmount,
        interestRate: terms.interestRate,
        interestAmount: terms.interestAmount,
        commissionAmount: terms.commissionAmount,
        netAdvance: terms.netAdvance,
        retentionAmount: terms.retentionAmount,
        cessionMethod: "ELECTRONIC",
        cessionRegistered: true,
        cessionDate: new Date(`${input.fechaCesion}T00:00:00Z`),
        aecXml: input.aecXml ? toPrismaBytes(input.aecXml) : null,
        aecTrackId: input.aecTrackId ?? null,
        cessionSiiStatus: input.cessionSiiStatus ?? "EOK",
        cessionRpetcRaw: {
          source: "external_reconciliation",
          reconciledAt: new Date().toISOString(),
          evidence: (input.evidence ?? {}) as Prisma.InputJsonValue,
        } satisfies Prisma.InputJsonObject,
        status: "APPROVED",
        submittedAt,
        approvedAt,
        notes: input.notes ?? null,
        createdBy: input.createdBy,
      },
      select: { id: true, code: true },
    });

    return {
      dteId: dte.id,
      operationId: op.id,
      code: op.code,
      created: true,
    };
  });
}

async function generateOperationCode(
  tx: Prisma.TransactionClient,
  tenantId: string,
  date: Date,
): Promise<string> {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const datePrefix = `CES-${yyyy}${mm}${dd}`;
  const count = await tx.financeFactoringOperation.count({
    where: { tenantId, code: { startsWith: datePrefix } },
  });
  return `${datePrefix}-${String(count + 1).padStart(4, "0")}`;
}

function normalizeRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toPrismaBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(buffer);
}
