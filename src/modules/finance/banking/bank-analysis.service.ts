/**
 * Banking Analysis Service
 *
 * Devuelve agregados estilo "tabla dinámica" sobre los movimientos
 * bancarios. Recibe filtros (cuenta, fechas, dirección) y una dimensión
 * de agrupación (contraparte, categoría/cuenta contable, mes, día).
 *
 * Diseño: para mantenerlo simple traemos los movimientos del rango y
 * agrupamos en memoria. Esto escala bien a decenas de miles de
 * transacciones — más que suficiente para cualquier período razonable.
 * Si en el futuro hace falta, se puede mover a SQL agregado.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type AnalysisGroupBy =
  | "counterparty"
  | "category"
  | "month"
  | "day";

export type AnalysisDirection = "income" | "expense" | "both";

export interface AnalysisFilters {
  bankAccountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  direction?: AnalysisDirection;
  groupBy: AnalysisGroupBy;
  /** Mostrar a lo más este número de grupos (resto en "Otros"). */
  topN?: number;
  /** Filtrar por una palabra en descripción/referencia. */
  search?: string;
}

export interface AnalysisGroup {
  /** Identificador estable (RUT, accountPlanId, "YYYY-MM", etc). */
  key: string;
  /** Etiqueta legible. */
  label: string;
  count: number;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
}

export interface AnalysisResult {
  groups: AnalysisGroup[];
  totalCount: number;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  /** Movimientos analizados (cap aplicado). */
  scannedCount: number;
  scanCap: number;
  capHit: boolean;
}

const SCAN_CAP = 50000;

/** Normaliza un RUT removiendo puntos y guion. */
function normalizeRut(s: string): string {
  return s.toUpperCase().replace(/[.\-\s]/g, "");
}

/** Extrae el primer RUT presente en un string. */
function extractRut(text: string): string | null {
  const match = text.match(/\d{1,2}\.?\d{3}\.?\d{3}-?[\dKk]/);
  return match ? normalizeRut(match[0]) : null;
}

/**
 * Genera una "huella" de descripción para agrupar transacciones similares
 * cuando NO hay RUT. Quita números, normaliza espacios, lowercases y
 * trunca a las primeras 3 palabras significativas. Ej.
 *   "Compra GOOGLE *ADS123456" → "compra google ads"
 *   "Transf.Internet a XX.XXX.XXX-X" → "transf internet a"
 */
function descriptionFingerprint(desc: string): string {
  const cleaned = desc
    .toLowerCase()
    .replace(/[*_\-.]/g, " ")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter((w) => w.length > 1);
  return words.slice(0, 3).join(" ");
}

export async function analyzeBankTransactions(
  tenantId: string,
  filters: AnalysisFilters
): Promise<AnalysisResult> {
  const where: Prisma.FinanceBankTransactionWhereInput = {
    tenantId,
    hiddenAt: null,
  };
  if (filters.bankAccountIds && filters.bankAccountIds.length > 0) {
    where.bankAccountId = { in: filters.bankAccountIds };
  }
  if (filters.dateFrom || filters.dateTo) {
    where.transactionDate = {};
    if (filters.dateFrom) {
      where.transactionDate.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      where.transactionDate.lte = new Date(filters.dateTo);
    }
  }
  if (filters.direction === "income") {
    where.amount = { gt: 0 };
  } else if (filters.direction === "expense") {
    where.amount = { lt: 0 };
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    where.OR = [
      { description: { contains: s, mode: "insensitive" } },
      { reference: { contains: s, mode: "insensitive" } },
    ];
  }

  // Para agrupar por categoría necesitamos los links → accountPlan.
  const includeLinks = filters.groupBy === "category";

  const txs = await prisma.financeBankTransaction.findMany({
    where,
    take: SCAN_CAP,
    orderBy: { transactionDate: "desc" },
    select: {
      id: true,
      transactionDate: true,
      description: true,
      reference: true,
      amount: true,
      ...(includeLinks
        ? {
            links: {
              select: {
                amount: true,
                accountPlanId: true,
                accountPlan: { select: { code: true, name: true } },
              },
            },
          }
        : {}),
    },
  });

  // Acumulador
  const groups = new Map<string, AnalysisGroup>();
  let totalCount = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  function pushTo(
    key: string,
    label: string,
    income: number,
    expense: number
  ) {
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalIncome += income;
      existing.totalExpense += expense;
      existing.totalNet = existing.totalIncome - existing.totalExpense;
    } else {
      groups.set(key, {
        key,
        label,
        count: 1,
        totalIncome: income,
        totalExpense: expense,
        totalNet: income - expense,
      });
    }
  }

  for (const tx of txs) {
    const amount = tx.amount.toNumber();
    const income = amount > 0 ? amount : 0;
    const expense = amount < 0 ? -amount : 0;
    totalCount += 1;
    totalIncome += income;
    totalExpense += expense;

    switch (filters.groupBy) {
      case "counterparty": {
        const rut =
          extractRut(tx.description) ?? extractRut(tx.reference ?? "");
        if (rut) {
          // Formatear el RUT con puntos y guion para el label.
          const body = rut.slice(0, -1);
          const dv = rut.slice(-1);
          const dotted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
          pushTo(`rut:${rut}`, `${dotted}-${dv}`, income, expense);
        } else {
          const fp = descriptionFingerprint(tx.description);
          if (fp) {
            pushTo(`fp:${fp}`, fp, income, expense);
          } else {
            pushTo(
              "unknown",
              "Sin contraparte identificable",
              income,
              expense
            );
          }
        }
        break;
      }
      case "category": {
        // Distribuir por cada link según su monto. Si no hay links, queda
        // en "Sin categorizar". Si hay parcial, el resto se va a "Sin
        // categorizar" también para que la suma cuadre.
        const linksList =
          (
            tx as unknown as {
              links?: {
                amount: { toNumber(): number };
                accountPlan: { code: string; name: string } | null;
              }[];
            }
          ).links ?? [];
        let assignedAbs = 0;
        const txAbs = Math.abs(amount);
        for (const link of linksList) {
          const linkAmt = link.amount.toNumber();
          assignedAbs += linkAmt;
          // Distribuir income/expense proporcionalmente al signo total
          const linkIncome = amount > 0 ? linkAmt : 0;
          const linkExpense = amount < 0 ? linkAmt : 0;
          if (link.accountPlan) {
            const key = `acc:${link.accountPlan.code}`;
            const label = `${link.accountPlan.code} ${link.accountPlan.name}`;
            pushTo(key, label, linkIncome, linkExpense);
          } else {
            pushTo("uncat", "Sin categorizar", linkIncome, linkExpense);
          }
        }
        const remaining = Math.max(0, txAbs - assignedAbs);
        if (remaining > 0.01) {
          const rIncome = amount > 0 ? remaining : 0;
          const rExpense = amount < 0 ? remaining : 0;
          pushTo("uncat", "Sin categorizar", rIncome, rExpense);
        }
        break;
      }
      case "month": {
        const d = new Date(tx.transactionDate);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        pushTo(key, key, income, expense);
        break;
      }
      case "day": {
        const d = new Date(tx.transactionDate);
        const key = d.toISOString().slice(0, 10);
        pushTo(key, key, income, expense);
        break;
      }
    }
  }

  // Ordenar por total absoluto desc y aplicar topN
  const sorted = Array.from(groups.values()).sort(
    (a, b) =>
      Math.abs(b.totalIncome - b.totalExpense) -
      Math.abs(a.totalIncome - a.totalExpense)
  );

  const topN = filters.topN ?? 50;
  let finalGroups: AnalysisGroup[];
  if (sorted.length > topN) {
    const top = sorted.slice(0, topN - 1);
    const rest = sorted.slice(topN - 1);
    const restGroup: AnalysisGroup = rest.reduce<AnalysisGroup>(
      (acc, g) => ({
        key: "__others__",
        label: `Otros (${rest.length})`,
        count: acc.count + g.count,
        totalIncome: acc.totalIncome + g.totalIncome,
        totalExpense: acc.totalExpense + g.totalExpense,
        totalNet: acc.totalNet + g.totalNet,
      }),
      {
        key: "__others__",
        label: `Otros (${rest.length})`,
        count: 0,
        totalIncome: 0,
        totalExpense: 0,
        totalNet: 0,
      }
    );
    finalGroups = [...top, restGroup];
  } else {
    finalGroups = sorted;
  }

  return {
    groups: finalGroups,
    totalCount,
    totalIncome,
    totalExpense,
    totalNet: totalIncome - totalExpense,
    scannedCount: txs.length,
    scanCap: SCAN_CAP,
    capHit: txs.length >= SCAN_CAP,
  };
}
