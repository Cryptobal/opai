import ExcelJS from "exceljs";
import type { DtBuiltReport } from "./portal-reports";
import { DT_SIGLAS_GLOSSARY } from "./constants";
import type { DtClienteArt26 } from "@/lib/fiscalizacion-dt/clientes";

const ARIAL_8: Partial<ExcelJS.Font> = { name: "Arial", size: 8 };

function applyArial(ws: ExcelJS.Worksheet) {
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = { ...ARIAL_8, ...(cell.font || {}), name: "Arial", size: cell.font?.size ?? 8 };
    });
  });
}

export async function reportToExcelBuffer(report: DtBuiltReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OPAI";
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.addRow([report.title]);
  ws.addRow([`Empleador: ${report.employerName}  RUT: ${report.employerRut}`]);
  ws.addRow([`Periodo: ${report.from} a ${report.to}`]);
  ws.addRow([]);

  if (report.empty) {
    ws.addRow([report.emptyMessage]);
  } else {
    for (const worker of report.workers) {
      ws.addRow([
        worker.header.trabajador || worker.workerName,
        worker.header.rutTrabajador || worker.workerRut,
        worker.installationName,
      ]);
      ws.addRow(report.columns.map((c) => c.label));
      if (worker.rows.length === 0 && worker.emptyMessage) {
        ws.addRow([worker.emptyMessage]);
      }
      for (const row of worker.rows) {
        const excelRow = ws.addRow(report.columns.map((c) => row[c.key] ?? ""));
        if (worker.modifiedRowIds?.includes(String(row.id ?? ""))) {
          excelRow.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
          });
        }
      }
      if (worker.weeklyTotals?.length) {
        for (const tot of worker.weeklyTotals) {
          ws.addRow(Object.values(tot));
        }
      }
      ws.addRow([]);
    }
  }

  ws.addRow([]);
  ws.addRow(["Siglas:", DT_SIGLAS_GLOSSARY]);
  applyArial(ws);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function clientesToExcelBuffer(data: {
  vigentes: DtClienteArt26[];
  desvinculados: DtClienteArt26[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OPAI";
  const headers = [
    "Razón social",
    "Nombre de fantasía",
    "Domicilio casa matriz",
    "RUT",
    "Tipo de servicio",
    "URL de fiscalización",
    "Vigencia inicio",
    "Fecha de término",
  ];
  const fill = (ws: ExcelJS.Worksheet, rows: DtClienteArt26[]) => {
    ws.addRow(headers);
    for (const c of rows) {
      ws.addRow([
        c.razonSocial,
        c.nombreFantasia,
        c.domicilioCasaMatriz,
        c.rut,
        c.tipoServicio,
        c.urlFiscalizacion,
        c.vigenciaInicio ?? "",
        c.vigenciaTermino ?? "",
      ]);
    }
    applyArial(ws);
  };
  fill(wb.addWorksheet("Clientes vigentes"), data.vigentes);
  fill(wb.addWorksheet("Ex clientes"), data.desvinculados);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function tableToExcelBuffer(
  title: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OPAI";
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.addRow([title]);
  ws.addRow(columns.map((c) => c.label));
  for (const row of rows) {
    ws.addRow(columns.map((c) => (row[c.key] as string | number | null) ?? ""));
  }
  applyArial(ws);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
