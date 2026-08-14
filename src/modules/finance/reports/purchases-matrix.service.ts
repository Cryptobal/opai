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

const NO_SUPPLIER_ID = "__no_supplier__";
const NO_CLIENT_ID = "__no_client__";
const RUT_PREFIX = "rut:";

interface RowAgg {
  total: number;
  monthly: number[];
  count: number;
  rut?: string;
  name?: string;
}

export async function getPurchasesMatrix(
  tenantId: string,
  period: FinanceReportPeriod,
  filters: FinanceReportFilters = {},
  options: { groupBy?: "supplier" | "client" } = {}
): Promise<FinanceMatrixResult> {
  const groupBy = options.groupBy ?? "supplier";
  const months = splitMonths(period);
  const fromDate = parseISODate(period.from);
  const toDate = parseISODate(period.to);

  // Excluir solo CLAIMED (rechazo total) y EXPIRED (sin acuse en plazo).
  // Incluir NULL, ACCEPTED, PENDING_REVIEW, PARTIAL_CLAIM como gasto efectivo.
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "RECEIVED",
      date: { gte: fromDate, lte: toDate },
      NOT: { receptionStatus: { in: ["CLAIMED", "EXPIRED"] } },
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
      issuerRut: true,
      issuerName: true,
    },
    orderBy: { date: "asc" },
  });

  const supplierIds = Array.from(
    new Set(dtes.map((d) => d.supplierId).filter((v): v is string => Boolean(v)))
  );
  const clientIds = Array.from(
    new Set(dtes.map((d) => d.crmAccountId).filter((v): v is string => Boolean(v)))
  );

  const [suppliers, clients] = await Promise.all([
    groupBy === "supplier" && supplierIds.length
      ? prisma.financeSupplier.findMany({
          where: { tenantId, id: { in: supplierIds } },
          select: { id: true, name: true, rut: true },
        })
      : Promise.resolve([]),
    groupBy === "client" && clientIds.length
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const byRow = new Map<string, RowAgg>();
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

    let key: string;
    let name: string | undefined;
    let rut: string | undefined;
    if (groupBy === "client") {
      if (d.crmAccountId) {
        key = d.crmAccountId;
        name = clientMap.get(d.crmAccountId)?.name ?? undefined;
      } else {
        key = NO_CLIENT_ID;
      }
    } else if (d.supplierId) {
      key = d.supplierId;
      const s = supplierMap.get(d.supplierId);
      name = s?.name ?? d.issuerName ?? undefined;
      rut = s?.rut ?? d.issuerRut ?? undefined;
    } else if (d.issuerRut) {
      key = `${RUT_PREFIX}${d.issuerRut}`;
      name = d.issuerName ?? undefined;
      rut = d.issuerRut;
    } else {
      key = NO_SUPPLIER_ID;
    }

    if (!byRow.has(key)) {
      byRow.set(key, {
        total: 0,
        monthly: months.map(() => 0),
        count: 0,
        rut,
        name,
      });
    }
    const slot = byRow.get(key)!;
    slot.total += amount;
    slot.monthly[monthIdx] += amount;
    slot.count += 1;
    totalsByMonth[monthIdx] += amount;
    grandTotal += amount;
    documentsCount += 1;
  }

  const rawRows = Array.from(byRow.entries()).map(([id, agg]) => ({ id, ...agg }));
  rawRows.sort((a, b) => b.total - a.total);

  const rows: FinanceMatrixRow[] = [];
  rawRows.forEach((r, idx) => {
    if (r.id === NO_CLIENT_ID) {
      rows.push({
        id: NO_CLIENT_ID,
        label: "(Sin cliente)",
        sublabel: `${r.count} DTE${r.count === 1 ? "" : "s"}`,
        color: "#6B7585",
        monthly: r.monthly,
        total: r.total,
        meta: { unassigned: true, groupBy: "client" },
      });
      return;
    }
    if (r.id === NO_SUPPLIER_ID) {
      rows.push({
        id: NO_SUPPLIER_ID,
        label: "(Sin RUT proveedor)",
        sublabel: `${r.count} DTE${r.count === 1 ? "" : "s"}`,
        color: "#6B7585",
        monthly: r.monthly,
        total: r.total,
        meta: { unassigned: true },
      });
      return;
    }
    if (r.id.startsWith(RUT_PREFIX)) {
      rows.push({
        id: r.id,
        label: r.name ?? r.rut ?? "Proveedor sin nombre",
        sublabel: `RUT ${r.rut} · sin ficha proveedor`,
        color: toneFor(idx),
        monthly: r.monthly,
        total: r.total,
        meta: { uncatalogued: true, rut: r.rut },
      });
      return;
    }
    if (groupBy === "client") {
      rows.push({
        id: r.id,
        label: r.name ?? "Cliente",
        sublabel: `${r.count} DTE${r.count === 1 ? "" : "s"}`,
        color: toneFor(idx),
        monthly: r.monthly,
        total: r.total,
        meta: { groupBy: "client" },
      });
      return;
    }
    rows.push({
      id: r.id,
      label: r.name ?? "Proveedor",
      sublabel: r.rut ? `RUT ${r.rut}` : undefined,
      color: toneFor(idx),
      monthly: r.monthly,
      total: r.total,
      meta: { rut: r.rut },
    });
  });

  return { period, rows, totalsByMonth, grandTotal, documentsCount };
}
