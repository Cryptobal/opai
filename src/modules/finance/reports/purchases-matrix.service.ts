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
  filters: FinanceReportFilters = {}
): Promise<FinanceMatrixResult> {
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

  // Las compras se agrupan por proveedor (issuer). Cargamos suppliers con su RUT.
  const supplierIds = Array.from(
    new Set(dtes.map((d) => d.supplierId).filter((v): v is string => Boolean(v)))
  );
  const suppliers = supplierIds.length
    ? await prisma.financeSupplier.findMany({
        where: { tenantId, id: { in: supplierIds } },
        select: { id: true, name: true, rut: true },
      })
    : [];
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

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

    // Key priority:
    //  1. supplierId (proveedor catalogado)
    //  2. issuerRut (mismo RUT = mismo proveedor)
    //  3. NO_SUPPLIER_ID
    let key: string;
    let name: string | undefined;
    let rut: string | undefined;
    if (d.supplierId) {
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
