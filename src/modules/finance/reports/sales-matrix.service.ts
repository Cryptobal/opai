import { prisma } from "@/lib/prisma";
import type { FinanceSiiStatus } from "@prisma/client";
import type {
  FinanceMatrixResult,
  FinanceMatrixRow,
  FinanceReportFilters,
  FinanceReportPeriod,
} from "./shared/types";
import { decimalToNumber } from "./shared/decimal";
import { parseISODate, splitMonths } from "./shared/period.helper";

const SUM_TYPES = [33, 34, 39, 41, 56];
const SUB_TYPES = [61];
const ACCEPTED_STATUSES: FinanceSiiStatus[] = ["ACCEPTED", "PENDING", "SENT"];

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
const toneFor = (idx: number): string => TONE_PALETTE[idx % TONE_PALETTE.length];

const NO_CLIENT_ID = "__no_client__";
const RUT_PREFIX = "rut:";

interface RowAgg {
  total: number;
  monthly: number[];
  count: number;
  /** Datos cuando el row viene de un RUT (no de un CrmAccount). */
  rut?: string;
  name?: string;
}

export async function getSalesMatrix(
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
      direction: "ISSUED",
      siiStatus: { in: ACCEPTED_STATUSES },
      date: { gte: fromDate, lte: toDate },
      ...(filters.crmAccountIds?.length ? { crmAccountId: { in: filters.crmAccountIds } } : {}),
      ...(filters.installationIds?.length
        ? { installationId: { in: filters.installationIds } }
        : {}),
    },
    select: {
      id: true,
      dteType: true,
      date: true,
      totalAmount: true,
      netAmount: true,
      crmAccountId: true,
      installationId: true,
      receiverRut: true,
      receiverName: true,
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

  const byClient = new Map<string, RowAgg>();
  const totalsByMonth = months.map(() => 0);
  let documentsCount = 0;
  let grandTotal = 0;

  for (const d of dtes) {
    const sign = SUB_TYPES.includes(d.dteType) ? -1 : SUM_TYPES.includes(d.dteType) ? 1 : 0;
    if (sign === 0) continue;
    const amount = decimalToNumber(d.netAmount) * sign;
    const dt = d.date as Date;
    const monthIdx = months.findIndex(
      (m) => dt.getFullYear() === m.year && dt.getMonth() + 1 === m.month
    );
    if (monthIdx < 0) continue;

    // Key resolution priority:
    //  1. crmAccountId (cliente CRM matched)
    //  2. receiverRut (mismo RUT = mismo cliente real, aún sin CRM)
    //  3. NO_CLIENT_ID
    let key: string;
    if (d.crmAccountId) key = d.crmAccountId;
    else if (d.receiverRut) key = `${RUT_PREFIX}${d.receiverRut}`;
    else key = NO_CLIENT_ID;

    if (!byClient.has(key)) {
      byClient.set(key, {
        total: 0,
        monthly: months.map(() => 0),
        count: 0,
        rut: d.receiverRut ?? undefined,
        name: d.receiverName ?? undefined,
      });
    }
    const slot = byClient.get(key)!;
    slot.total += amount;
    slot.monthly[monthIdx] += amount;
    slot.count += 1;
    totalsByMonth[monthIdx] += amount;
    grandTotal += amount;
    documentsCount += 1;
  }

  const includeSector = (industry: string | null | undefined): boolean => {
    if (!filters.sectors?.length) return true;
    return industry ? filters.sectors.includes(industry) : false;
  };
  const includeOnlyActive = filters.onlyActiveClients !== false;

  const rawRows = Array.from(byClient.entries()).map(([id, agg]) => ({ id, ...agg }));
  rawRows.sort((a, b) => b.total - a.total);

  const rows: FinanceMatrixRow[] = [];
  rawRows.forEach((r, idx) => {
    if (r.id === NO_CLIENT_ID) {
      rows.push({
        id: NO_CLIENT_ID,
        label: "(Sin RUT receptor)",
        sublabel: `${r.count} DTE${r.count === 1 ? "" : "s"}`,
        color: "#6B7585",
        monthly: r.monthly,
        total: r.total,
        meta: { unassigned: true },
      });
      return;
    }
    if (r.id.startsWith(RUT_PREFIX)) {
      // Cliente sin CRM, agrupado por RUT
      rows.push({
        id: r.id,
        label: r.name ?? r.rut ?? "Cliente sin nombre",
        sublabel: `RUT ${r.rut} · sin ficha CRM`,
        color: toneFor(idx),
        monthly: r.monthly,
        total: r.total,
        meta: { uncatalogued: true, rut: r.rut },
      });
      return;
    }
    const acc = accMap.get(r.id);
    if (!acc) return;
    if (!includeSector(acc.industry)) return;
    if (includeOnlyActive && acc.status === "client_inactive") return;
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
