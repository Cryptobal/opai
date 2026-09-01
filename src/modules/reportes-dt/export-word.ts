import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  HeadingLevel,
  ShadingType,
} from "docx";
import type { DtBuiltReport } from "./portal-reports";
import { DT_SIGLAS_GLOSSARY } from "./constants";

const ARIAL_8 = { font: "Arial", size: 16 }; // half-points: 8pt

function t(text: string, opts?: { bold?: boolean }): TextRun {
  return new TextRun({ text, font: "Arial", size: 16, bold: opts?.bold });
}

function cell(text: string, opts?: { bold?: boolean; highlight?: boolean }): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [t(text, { bold: opts?.bold })] })],
    shading: opts?.highlight
      ? { type: ShadingType.CLEAR, fill: "FFF3CD" }
      : undefined,
  });
}

export async function reportToWordBuffer(report: DtBuiltReport): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(report.title, { bold: true })] }),
    new Paragraph({ children: [t(`${report.employerName} · ${report.employerRut}`)] }),
    new Paragraph({ children: [t(`Periodo: ${report.from} a ${report.to}`)] }),
  ];

  if (report.empty) {
    children.push(new Paragraph({ children: [t(report.emptyMessage)] }));
  } else {
    for (const worker of report.workers) {
      children.push(
        new Paragraph({
          spacing: { before: 200 },
          children: [
            t(
              `${worker.workerName} · ${worker.workerRut} · ${worker.installationName}`,
              { bold: true },
            ),
          ],
        }),
      );
      if (worker.rows.length === 0 && worker.emptyMessage) {
        children.push(new Paragraph({ children: [t(worker.emptyMessage)] }));
        continue;
      }
      const header = new TableRow({
        children: report.columns.map((c) => cell(c.label, { bold: true })),
      });
      const body = worker.rows.map((row) => {
        const highlight = worker.modifiedRowIds?.includes(String(row.id ?? "")) ?? false;
        return new TableRow({
          children: report.columns.map((c) => cell(String(row[c.key] ?? ""), { highlight })),
        });
      });
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [header, ...body],
        }),
      );
      if (worker.weeklyTotals?.length) {
        for (const tot of worker.weeklyTotals) {
          children.push(new Paragraph({ children: [t(Object.values(tot).map((v) => String(v ?? "")).join(" · "))] }));
        }
      }
    }
  }

  children.push(new Paragraph({ spacing: { before: 200 }, children: [t(DT_SIGLAS_GLOSSARY)] }));

  const doc = new Document({
    styles: {
      default: {
        document: { run: ARIAL_8 },
      },
    },
    sections: [{ children }],
  });
  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}

export async function simpleTableWordBuffer(
  title: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
  emptyMessage?: string,
): Promise<Buffer> {
  return reportToWordBuffer({
    tipo: "tabla",
    title,
    employerName: "",
    employerRut: "",
    from: "",
    to: "",
    empty: rows.length === 0,
    emptyMessage: emptyMessage || "",
    columns,
    workers:
      rows.length === 0
        ? []
        : [
            {
              workerId: "all",
              workerName: "",
              workerRut: "",
              installationName: "",
              cargo: "",
              header: {},
              rows: rows as DtBuiltReport["workers"][0]["rows"],
            },
          ],
    glossary: DT_SIGLAS_GLOSSARY,
  });
}
