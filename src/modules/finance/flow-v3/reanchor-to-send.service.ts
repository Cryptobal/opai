/**
 * Reancla DTEs emitidos con fecha futura a la semana del envío real
 * (override de visibilidad en el flujo). NO toca el documento ni el SII.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  formatDateOnlyUtcYmd,
  parseYmdToDbDate,
  todayChileStr,
} from "@/lib/fx-date";
import { upsertDteDateOverride } from "@/modules/finance/cashflow/dte-date-override.service";
import { weekStartYmd, ymdToDate } from "./weeks";

export type ReanchorCandidate = {
  dteId: string;
  folio: number;
  receiverName: string;
  docDateYmd: string;
  sendYmd: string;
  amountClp: number;
  pendingClp: number;
};

export type ReanchorResult = {
  reanchored: Array<{
    dteId: string;
    folio: number;
    sendYmd: string;
    weekStart: string;
  }>;
  skipped: Array<{ dteId: string; folio: number; reason: string }>;
};

async function resolveSendYmd(dteId: string, createdAt: Date): Promise<string> {
  const firstEmail = await prisma.financeDteEmailLog.findFirst({
    where: { dteId, status: { in: ["SENT", "DELIVERED", "OPENED"] } },
    orderBy: { sentAt: "asc" },
    select: { sentAt: true },
  });
  if (firstEmail?.sentAt) return formatDateOnlyUtcYmd(firstEmail.sentAt);
  return formatDateOnlyUtcYmd(createdAt);
}

/** Lista emitidos con fecha doc > hoy (o > envío+20d) candidatos a reanclar. */
export async function listFutureDatedIssued(tenantId: string): Promise<ReanchorCandidate[]> {
  const todayYmd = todayChileStr();
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      folio: { gt: 0 },
      siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
      voidedByCreditNoteId: null,
    },
    select: {
      id: true,
      folio: true,
      receiverName: true,
      date: true,
      createdAt: true,
      totalAmount: true,
      amountPaid: true,
      paymentStatus: true,
      reconciledAt: true,
    },
    take: 500,
  });

  const out: ReanchorCandidate[] = [];
  for (const d of dtes) {
    const docYmd = formatDateOnlyUtcYmd(d.date);
    if (docYmd <= todayYmd) continue;
    // Pagadas/conciliadas: la capa real manda; omitir reanclaje.
    if (d.paymentStatus === "PAID" || d.reconciledAt) continue;
    const sendYmd = await resolveSendYmd(d.id, d.createdAt);
    out.push({
      dteId: d.id,
      folio: d.folio,
      receiverName: d.receiverName,
      docDateYmd: docYmd,
      sendYmd,
      amountClp: Math.round(Number(d.totalAmount)),
      pendingClp: Math.round(Number(d.totalAmount) - Number(d.amountPaid ?? 0)),
    });
  }
  return out;
}

/**
 * Crea/actualiza override a la semana del envío real para cada DTE.
 * Omite pagados/conciliados. Idempotente.
 */
export async function reanchorIssuedToSendWeek(args: {
  tenantId: string;
  userId: string;
  dteIds: string[];
}): Promise<ReanchorResult> {
  const result: ReanchorResult = { reanchored: [], skipped: [] };
  if (args.dteIds.length === 0) return result;

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId: args.tenantId,
      id: { in: args.dteIds },
      direction: "ISSUED",
      folio: { gt: 0 },
    },
    select: {
      id: true,
      folio: true,
      date: true,
      createdAt: true,
      paymentStatus: true,
      reconciledAt: true,
    },
  });
  const byId = new Map(dtes.map((d) => [d.id, d]));

  for (const id of args.dteIds) {
    const d = byId.get(id);
    if (!d) {
      result.skipped.push({ dteId: id, folio: 0, reason: "no encontrado en tenant" });
      continue;
    }
    if (d.paymentStatus === "PAID" || d.reconciledAt) {
      result.skipped.push({
        dteId: d.id,
        folio: d.folio,
        reason: "pagada/conciliada — capa real manda",
      });
      continue;
    }
    const sendYmd = await resolveSendYmd(d.id, d.createdAt);
    const weekStart = weekStartYmd(ymdToDate(sendYmd) ?? d.createdAt);
    await upsertDteDateOverride({
      tenantId: args.tenantId,
      dteId: d.id,
      customDate: parseYmdToDbDate(weekStart),
      createdBy: args.userId,
      reason: `Reanclaje v4.6 a semana de envío real (${sendYmd})`,
    });
    result.reanchored.push({
      dteId: d.id,
      folio: d.folio,
      sendYmd,
      weekStart,
    });
  }
  return result;
}
