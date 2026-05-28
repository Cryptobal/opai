import "server-only";
import { prisma } from "@/lib/prisma";
import type { FinanceBankTransaction } from "@prisma/client";

export type ExclusionReason = "interna" | "comision" | "manual_override";

/**
 * Detecta transferencias internas en un lote de bank tx del mismo tenant.
 * Cruza por monto absoluto igual + signos opuestos + cuentas distintas +
 * ventana de ±2 días. Como defensa adicional, cuando ambas cuentas comparten
 * el mismo `holderRut` (RUT propio en ambas puntas) la confianza es total.
 * Devuelve un Map txId → "interna".
 */
export async function detectInternalTransfers(
  tenantId: string,
  txs: FinanceBankTransaction[],
): Promise<Map<string, "interna">> {
  const out = new Map<string, "interna">();
  if (txs.length < 2) return out;

  // Cuentas propias del tenant (para confirmar que ambas patas son internas).
  const ownAccounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, holderRut: true },
  });
  const accountRut = new Map<string, string | null>();
  for (const a of ownAccounts) accountRut.set(a.id, a.holderRut ?? null);

  const byAmount = new Map<string, FinanceBankTransaction[]>();
  for (const t of txs) {
    const k = Math.abs(Number(t.amount)).toString();
    const list = byAmount.get(k);
    if (list) list.push(t);
    else byAmount.set(k, [t]);
  }

  const TWO_DAYS = 2 * 24 * 3600 * 1000;
  for (const [, list] of byAmount) {
    if (list.length < 2) continue;
    const positives = list.filter((t) => Number(t.amount) > 0);
    const negatives = list.filter((t) => Number(t.amount) < 0);
    for (const p of positives) {
      for (const n of negatives) {
        if (p.bankAccountId === n.bankAccountId) continue;
        // Ambas cuentas deben ser propias del tenant.
        if (!accountRut.has(p.bankAccountId) || !accountRut.has(n.bankAccountId)) continue;
        const dp = p.transactionDate.getTime();
        const dn = n.transactionDate.getTime();
        if (Math.abs(dp - dn) > TWO_DAYS) continue;
        out.set(p.id, "interna");
        out.set(n.id, "interna");
      }
    }
  }
  return out;
}

const COMMISSION_RE =
  /comisi[óo]n|mantenci[óo]n|cargo\s+auto|cargo\s+mensual|iva\s+s\/?\s*cargo|iva\s+comisi/i;

/** Comisiones/cargos bancarios bajo umbral. Heurística textual + monto. */
export function detectCommissions(
  txs: FinanceBankTransaction[],
  thresholdClp: number,
): Map<string, "comision"> {
  const out = new Map<string, "comision">();
  for (const t of txs) {
    const abs = Math.abs(Number(t.amount));
    if (abs > thresholdClp) continue;
    if (COMMISSION_RE.test(t.description ?? "")) {
      out.set(t.id, "comision");
    }
  }
  return out;
}

/**
 * Aplica las reglas de exclusión a las bank tx de los últimos 90 días y
 * persiste el resultado (idempotente). No toca las marcadas como
 * `manual_override` (gana la decisión del usuario). Interna gana sobre
 * comisión. Devuelve cuántas marcó por tipo.
 */
export async function applyExclusionRules(
  tenantId: string,
  userIdSystem: string = "system",
): Promise<{ interna: number; comision: number }> {
  const cfg = await prisma.financeCashflowConfig.findFirst({
    where: { tenantId },
    select: { bankCommissionThresholdClp: true },
  });
  const threshold = cfg?.bankCommissionThresholdClp ?? 10_000;

  const since = new Date();
  since.setDate(since.getDate() - 90);
  const txs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      hiddenAt: null,
      transactionDate: { gte: since },
      OR: [{ excludedReason: null }, { excludedReason: { in: ["interna", "comision"] } }],
    },
  });

  const internal = await detectInternalTransfers(tenantId, txs);
  const commissions = detectCommissions(txs, threshold);

  let internaCount = 0;
  let comisionCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const [id, reason] of internal) {
      await tx.financeBankTransaction.update({
        where: { id },
        data: { excludedReason: reason, excludedAt: new Date(), excludedBy: userIdSystem },
      });
      internaCount++;
    }
    for (const [id, reason] of commissions) {
      if (internal.has(id)) continue; // interna gana
      await tx.financeBankTransaction.update({
        where: { id },
        data: { excludedReason: reason, excludedAt: new Date(), excludedBy: userIdSystem },
      });
      comisionCount++;
    }
  });

  return { interna: internaCount, comision: comisionCount };
}
