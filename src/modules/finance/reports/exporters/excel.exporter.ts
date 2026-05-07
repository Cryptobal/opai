import ExcelJS, { type Workbook, type Worksheet } from "exceljs";
import type {
  BalanceSheetResult,
  DashboardKpis,
  FinanceMatrixResult,
  IncomeStatementResult,
  IncomeStatementSection,
  LedgerResult,
  ProfitabilityResult,
} from "../shared/types";

const HEADER_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FF0066FF" },
};
const TOTAL_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFE5EDFF" },
};
const FONT_HEADER = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
const FONT_TOTAL = { bold: true, size: 11 };
const NUMFMT_CLP = '"$"#,##0;[Red]-"$"#,##0';

function setupWorkbook(): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OPAI · Finanzas";
  wb.created = new Date();
  return wb;
}

function addOpaiHeader(ws: Worksheet, title: string, subtitle: string): number {
  ws.mergeCells("A1:F1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `OPAI · ${title}`;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF0066FF" } };
  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = subtitle;
  ws.getCell("A2").font = { size: 9, color: { argb: "FF6B7585" } };
  ws.getRow(3).height = 6;
  return 4;
}

function safeDeltaPct(curr: number, prev: number): number {
  if (!prev) return 0;
  return (curr - prev) / Math.abs(prev);
}

function buildMatrixWorkbook(
  data: FinanceMatrixResult,
  tenantName: string,
  title: string,
  sheetName: string
): Promise<Buffer> {
  const wb = setupWorkbook();
  const ws = wb.addWorksheet(sheetName);
  const startRow = addOpaiHeader(
    ws,
    title,
    `${tenantName} · ${data.period.label} · ${data.documentsCount} DTEs`
  );
  const months = data.rows[0]?.monthly.length ?? 12;
  const headerRow = ws.getRow(startRow);
  headerRow.values = [
    "Cliente / CC",
    "Sector",
    ...Array.from({ length: months }, (_, i) => `Mes ${i + 1}`),
    "Total",
  ];
  headerRow.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = FONT_HEADER;
    c.alignment = { horizontal: "center" };
  });
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 18;
  for (let i = 3; i <= months + 2; i++) ws.getColumn(i).width = 13;
  ws.getColumn(months + 3).width = 16;

  let r = startRow + 1;
  for (const row of data.rows) {
    const r0 = ws.getRow(r);
    r0.values = [row.label, row.sublabel ?? "", ...row.monthly, row.total];
    for (let i = 3; i <= months + 3; i++) r0.getCell(i).numFmt = NUMFMT_CLP;
    r += 1;
  }
  const tr = ws.getRow(r);
  tr.values = ["TOTAL", "", ...data.totalsByMonth, data.grandTotal];
  tr.eachCell((c) => {
    c.fill = TOTAL_FILL;
    c.font = FONT_TOTAL;
  });
  for (let i = 3; i <= months + 3; i++) tr.getCell(i).numFmt = NUMFMT_CLP;

  return wb.xlsx.writeBuffer().then((b) => Buffer.from(b));
}

export async function buildSalesMatrixWorkbook(
  data: FinanceMatrixResult,
  tenantName: string
): Promise<Buffer> {
  return buildMatrixWorkbook(data, tenantName, "Ventas por cliente · Heatmap mensual", "Ventas por cliente");
}

export async function buildPurchasesMatrixWorkbook(
  data: FinanceMatrixResult,
  tenantName: string
): Promise<Buffer> {
  return buildMatrixWorkbook(data, tenantName, "Compras por centro de costo", "Compras por cliente");
}

export async function buildIncomeStatementWorkbook(
  data: IncomeStatementResult,
  tenantName: string
): Promise<Buffer> {
  const wb = setupWorkbook();
  const ws = wb.addWorksheet("EE.RR.");
  const sub = data.comparison
    ? `${tenantName} · ${data.period.label} vs. ${data.comparison.prev.label}`
    : `${tenantName} · ${data.period.label}`;
  const startRow = addOpaiHeader(ws, "Estado de Resultado", sub);
  const headers = data.comparison
    ? ["Código", "Cuenta", data.comparison.prev.label, data.period.label, "Δ%"]
    : ["Código", "Cuenta", data.period.label];
  const headerRow = ws.getRow(startRow);
  headerRow.values = headers;
  headerRow.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = FONT_HEADER;
  });
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 10;

  let r = startRow + 1;
  const writeSection = (
    label: string,
    items: IncomeStatementSection["items"],
    total: number,
    prevTotal?: number
  ) => {
    const lr = ws.getRow(r);
    lr.values = ["", label];
    lr.font = { bold: true, color: { argb: "FF0066FF" } };
    r += 1;
    for (const it of items) {
      const row = ws.getRow(r);
      const vals: (string | number)[] = ["  " + it.accountCode, it.accountName];
      if (data.comparison) {
        vals.push(it.prevAmount ?? 0, it.amount, safeDeltaPct(it.amount, it.prevAmount ?? 0));
      } else {
        vals.push(it.amount);
      }
      row.values = vals;
      row.getCell(3).numFmt = NUMFMT_CLP;
      if (data.comparison) {
        row.getCell(4).numFmt = NUMFMT_CLP;
        row.getCell(5).numFmt = "0.0%";
      }
      r += 1;
    }
    const tr = ws.getRow(r);
    if (data.comparison) {
      tr.values = ["", `Total ${label}`, prevTotal ?? 0, total, safeDeltaPct(total, prevTotal ?? 0)];
    } else {
      tr.values = ["", `Total ${label}`, total];
    }
    tr.eachCell((c) => {
      c.fill = TOTAL_FILL;
      c.font = FONT_TOTAL;
    });
    tr.getCell(3).numFmt = NUMFMT_CLP;
    if (data.comparison) tr.getCell(4).numFmt = NUMFMT_CLP;
    r += 2;
  };

  writeSection("Ingresos", data.revenue.items, data.revenue.total, data.revenue.prevTotal);
  writeSection("Costos", data.cogs.items, data.cogs.total, data.cogs.prevTotal);

  const gr = ws.getRow(r);
  gr.values = ["", "MARGEN BRUTO", data.prevGrossProfit ?? "", data.grossProfit];
  gr.eachCell((c) => (c.font = { bold: true, color: { argb: "FF10B981" } }));
  gr.getCell(4).numFmt = NUMFMT_CLP;
  r += 2;

  writeSection("Gastos operacionales", data.opex.items, data.opex.total, data.opex.prevTotal);

  const er = ws.getRow(r);
  er.values = ["", "EBITDA", data.prevEbitda ?? "", data.ebitda];
  er.eachCell((c) => (c.font = { bold: true, color: { argb: "FF0066FF" }, size: 12 }));
  er.getCell(4).numFmt = NUMFMT_CLP;
  r += 2;

  writeSection(
    "Resultado financiero",
    data.financialResult.items,
    data.financialResult.total,
    data.financialResult.prevTotal
  );
  writeSection("Impuestos", data.taxes.items, data.taxes.total, data.taxes.prevTotal);

  const ni = ws.getRow(r);
  ni.values = ["", "UTILIDAD NETA", data.prevNetIncome ?? "", data.netIncome];
  ni.eachCell((c) => (c.font = { bold: true, color: { argb: "FF10B981" }, size: 13 }));
  ni.getCell(4).numFmt = NUMFMT_CLP;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildBalanceSheetWorkbook(
  data: BalanceSheetResult,
  tenantName: string
): Promise<Buffer> {
  const wb = setupWorkbook();
  const ws = wb.addWorksheet("Balance");
  const sub = data.prevAsOf
    ? `${tenantName} · al ${data.asOf} (vs. ${data.prevAsOf})`
    : `${tenantName} · al ${data.asOf}`;
  const startRow = addOpaiHeader(ws, "Balance General", sub);
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  const headers = data.prevAsOf
    ? ["Código", "Cuenta", `Al ${data.prevAsOf}`, `Al ${data.asOf}`]
    : ["Código", "Cuenta", `Al ${data.asOf}`];
  const headerRow = ws.getRow(startRow);
  headerRow.values = headers;
  headerRow.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = FONT_HEADER;
  });

  let r = startRow + 1;
  const writeBlock = (
    title: string,
    sections: Array<{
      label: string;
      items: BalanceSheetResult["asset"]["current"]["items"];
      total: number;
      prevTotal?: number;
    }>,
    blockTotal: number,
    blockPrevTotal?: number
  ) => {
    const tr = ws.getRow(r);
    tr.values = ["", title];
    tr.font = { bold: true, color: { argb: "FF0066FF" }, size: 12 };
    r += 1;
    for (const sec of sections) {
      const sr = ws.getRow(r);
      sr.values = ["", sec.label];
      sr.font = { italic: true, color: { argb: "FF6B7585" } };
      r += 1;
      for (const it of sec.items) {
        const row = ws.getRow(r);
        const vals: (string | number)[] = ["  " + it.accountCode, it.accountName];
        if (data.prevAsOf) vals.push(it.prevAmount ?? 0, it.amount);
        else vals.push(it.amount);
        row.values = vals;
        row.getCell(3).numFmt = NUMFMT_CLP;
        if (data.prevAsOf) row.getCell(4).numFmt = NUMFMT_CLP;
        r += 1;
      }
    }
    const fr = ws.getRow(r);
    fr.values = data.prevAsOf
      ? ["", `TOTAL ${title}`, blockPrevTotal ?? 0, blockTotal]
      : ["", `TOTAL ${title}`, blockTotal];
    fr.eachCell((c) => {
      c.fill = TOTAL_FILL;
      c.font = FONT_TOTAL;
    });
    fr.getCell(3).numFmt = NUMFMT_CLP;
    if (data.prevAsOf) fr.getCell(4).numFmt = NUMFMT_CLP;
    r += 2;
  };

  writeBlock(
    "ACTIVO",
    [data.asset.current, data.asset.nonCurrent],
    data.asset.total,
    data.asset.prevTotal
  );
  writeBlock(
    "PASIVO",
    [data.liability.current, data.liability.nonCurrent],
    data.liability.total,
    data.liability.prevTotal
  );
  writeBlock("PATRIMONIO", [data.equity], data.equity.total, data.equity.prevTotal);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildProfitabilityWorkbook(
  data: ProfitabilityResult,
  tenantName: string
): Promise<Buffer> {
  const wb = setupWorkbook();
  const ws = wb.addWorksheet("Rentabilidad");
  const startRow = addOpaiHeader(
    ws,
    "Rentabilidad por cliente",
    `${tenantName} · ${data.period.label} · método: ${data.opexAllocationMethod}`
  );
  const headerRow = ws.getRow(startRow);
  headerRow.values = [
    "#",
    "Cliente",
    "Sector",
    "Ventas",
    "Costo directo",
    "Opex prorrateado",
    "Margen",
    "Margen %",
  ];
  headerRow.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = FONT_HEADER;
  });
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 32;
  ws.getColumn(3).width = 16;
  for (let i = 4; i <= 8; i++) ws.getColumn(i).width = 16;

  let r = startRow + 1;
  data.rows.forEach((row, i) => {
    const rr = ws.getRow(r);
    rr.values = [
      i + 1,
      row.clientName,
      row.sector ?? "",
      row.revenue,
      row.directCost,
      row.allocatedOpex,
      row.margin,
      row.marginPct / 100,
    ];
    [4, 5, 6, 7].forEach((c) => (rr.getCell(c).numFmt = NUMFMT_CLP));
    rr.getCell(8).numFmt = "0.0%";
    r += 1;
  });

  const tr = ws.getRow(r);
  tr.values = [
    "",
    "TOTAL",
    "",
    data.totals.revenue,
    data.totals.directCost,
    data.totals.allocatedOpex,
    data.totals.margin,
    data.totals.marginPct / 100,
  ];
  tr.eachCell((c) => {
    c.fill = TOTAL_FILL;
    c.font = FONT_TOTAL;
  });
  [4, 5, 6, 7].forEach((c) => (tr.getCell(c).numFmt = NUMFMT_CLP));
  tr.getCell(8).numFmt = "0.0%";

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildLedgerWorkbook(
  data: LedgerResult,
  tenantName: string
): Promise<Buffer> {
  const wb = setupWorkbook();
  const ws = wb.addWorksheet("Libro Mayor");
  const startRow = addOpaiHeader(
    ws,
    `Libro Mayor · ${data.account.code} ${data.account.name}`,
    `${tenantName} · ${data.period.label} · ${data.entries.length} movimientos`
  );
  const headerRow = ws.getRow(startRow);
  headerRow.values = ["Fecha", "N°", "Descripción", "Referencia", "Centro Costo", "Debe", "Haber", "Saldo"];
  headerRow.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = FONT_HEADER;
  });
  [12, 8, 38, 14, 22, 14, 14, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  let r = startRow + 1;
  const ob = ws.getRow(r);
  ob.values = ["", "", "Saldo inicial", "", "", "", "", data.openingBalance];
  ob.font = { italic: true, color: { argb: "FF6B7585" } };
  ob.getCell(8).numFmt = NUMFMT_CLP;
  r += 1;

  for (const e of data.entries) {
    const row = ws.getRow(r);
    row.values = [
      e.date,
      e.entryNumber,
      e.description,
      e.reference ?? "",
      e.costCenterName ?? "",
      e.debit,
      e.credit,
      e.runningBalance,
    ];
    [6, 7, 8].forEach((c) => (row.getCell(c).numFmt = NUMFMT_CLP));
    r += 1;
  }

  const tr = ws.getRow(r);
  tr.values = ["", "", "TOTAL", "", "", data.totalDebit, data.totalCredit, data.closingBalance];
  tr.eachCell((c) => {
    c.fill = TOTAL_FILL;
    c.font = FONT_TOTAL;
  });
  [6, 7, 8].forEach((c) => (tr.getCell(c).numFmt = NUMFMT_CLP));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildDashboardWorkbook(
  data: DashboardKpis,
  tenantName: string
): Promise<Buffer> {
  const wb = setupWorkbook();
  const ws = wb.addWorksheet("Dashboard");
  const startRow = addOpaiHeader(ws, "Dashboard ejecutivo", `${tenantName} · ${data.period.label}`);
  let r = startRow;
  const writeKpi = (label: string, value: number, deltaPct: number, sub?: string) => {
    const row = ws.getRow(r);
    row.values = [label, value, deltaPct / 100, sub ?? ""];
    row.getCell(2).numFmt = NUMFMT_CLP;
    row.getCell(3).numFmt = "0.0%";
    r += 1;
  };
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 30;

  writeKpi("Ingresos", data.revenue.value, data.revenue.deltaPct);
  writeKpi(
    "EBITDA",
    data.ebitda.value,
    data.ebitda.deltaPct,
    `Margen ${data.ebitda.marginPct.toFixed(1)}%`
  );
  writeKpi(
    "Utilidad neta",
    data.netIncome.value,
    data.netIncome.deltaPct,
    `Margen ${data.netIncome.marginPct.toFixed(1)}%`
  );
  writeKpi(
    "Cuentas por cobrar",
    data.accountsReceivable.value,
    data.accountsReceivable.deltaPct,
    `${data.accountsReceivable.activeInvoices} facturas`
  );
  writeKpi("DSO (días)", data.dso.value, data.dso.deltaPct);

  r += 2;
  const topHeader = ws.getRow(r);
  topHeader.values = ["Top 5 clientes", "Total", "Participación %"];
  topHeader.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = FONT_HEADER;
  });
  r += 1;
  for (const c of data.topClients) {
    const row = ws.getRow(r);
    row.values = [c.name, c.total, c.pct / 100];
    row.getCell(2).numFmt = NUMFMT_CLP;
    row.getCell(3).numFmt = "0.0%";
    r += 1;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
