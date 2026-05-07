import { prisma } from "@/lib/prisma";
import type {
  FinanceMatrixResult,
  FinanceMatrixRow,
  FinanceReportFilters,
  FinanceReportPeriod,
} from "./shared/types";
import { decimalToNumber } from "./shared/decimal";
import { parseISODate, splitMonths } from "./shared/period.helper";

const SUM_TYPES_RECV = [33, 34, 46, 56];
const SUB_TYPES_RECV = [61];

const TONE_PALETTE = [
  "#8B5CF6",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#F43F5E",
  "#14B8A6",
  "#0EA5E9",
  "#EC4899",
  "#84CC16",
  "#A855F7",
];
const toneFor = (i: number): string => TONE_PALETTE[i % TONE_PALETTE.length];

const NO_CLIENT_ID = "__no_client__";

export async function getPurchasesMatrix(
  tenantId: string,
  period: FinanceReportPeriod,
  filters: FinanceReportFilters = {}
): Promise<FinanceMatrixResult> {
  const months = splitMonths(period);
  const fromDate = parseISODate(period.from);
  const toDate = parseISODate(period.to);

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "RECEIVED",
      date: { gte: fromDate, lte: toDate },
      OR: [
        { receptionStatus: null },
        { receptionStatus: { in: ["ACCEPTED"] } },
      ],
      ...(filters.crmAccountIds?.length ? { crmAccountId: { in: filters.crmAccountIds } } : {}),
      ...(filters.installationIds?.length
        ? { installationId: { in: filters.installationIds } }
        : {}),
    },
    select: {
      id: true,
      dteType: true,
      date: true,
      netAmount: true,
      crmAccountId: true,
      installationId: true,
      supplierId: true,
    },
    orderBy: { date: "asc" },
  });

  const accountIds = Array.from(
    new Set(dtes.map((d) => d.crmAccountId).filter((v): v is string => Boolean(v)))
  );
  const accounts = accountIds.length
    ? await prisma.crmAccount.findMany({
        where: { tenantId, id: { in: accountIds } },
        select: {
          id: true,
          name: true,
          industry: true,
          status: true,
          installations: { select: { id: true } },
        },
      })
    : [];
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  const byClient = new Map<string, { total: number; monthly: number[]; count: number }>();
  const totalsByMonth = months.map(() => 0);
  let documentsCount = 0;
  let grandTotal = 0;

  for (const d of dtes) {
    const sign = SUB_TYPES_RECV.includes(d.dteType)
      ? -1
      : SUM_TYPES_RECV.includes(d.dteType)
        ? 1
        : 0;
    if (sign === 0) continue;
    const amount = decimalToNumber(d.netAmount) * sign;
    const dt = d.date as Date;
    const monthIdx = months.findIndex(
      (m) => dt.getFullYear() === m.year && dt.getMonth() + 1 === m.month
    );
    if (monthIdx < 0) continue;
    const key = d.crmAccountId ?? NO_CLIENT_ID;
    if (!byClient.has(key)) {
      byClient.set(key, { total: 0, monthly: months.map(() => 0), count: 0 });
    }
    const slot = byClient.get(key)!;
    slot.total += amount;
    slot.monthly[monthIdx] += amount;
    slot.count += 1;
    totalsByMonth[monthIdx] += amount;
    grandTotal += amount;
    documentsCount += 1;
  }

  const rawRows = Array.from(byClient.entries()).map(([id, agg]) => ({ id, ...agg }));
  rawRows.sort((a, b) => b.total - a.total);

  const rows: FinanceMatrixRow[] = [];
  rawRows.forEach((r, idx) => {
    if (r.id === NO_CLIENT_ID) {
      rows.push({
        id: NO_CLIENT_ID,
        label: "(Sin cliente asignado)",
        sublabel: `${r.count} DTEs · gasto general`,
        color: "#6B7585",
        monthly: r.monthly,
        total: r.total,
        meta: { unassigned: true },
      });
      return;
    }
    const acc = accMap.get(r.id);
    if (!acc) return;
    if (filters.sectors?.length && (!acc.industry || !filters.sectors.includes(acc.industry))) return;
    if (filters.onlyActiveClients !== false && acc.status === "client_inactive") return;
    rows.push({
      id: r.id,
      label: acc.name,
      sublabel: `${acc.industry ?? "Sin sector"} · ${acc.installations.length} inst.`,
      color: toneFor(idx),
      monthly: r.monthly,
      total: r.total,
      meta: { sector: acc.industry, installationsCount: acc.installations.length },
    });
  });

  return { period, rows, totalsByMonth, grandTotal, documentsCount };
}
