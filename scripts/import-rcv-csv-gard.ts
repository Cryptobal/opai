/**
 * Importa CSV de registro de compras/ventas (export SII / RCV) al tenant Gard,
 * como FinanceDte RECEIVED / ISSUED, idempotente con el sync RCV existente.
 *
 * Uso:
 *   npx tsx scripts/import-rcv-csv-gard.ts /ruta/a/*.csv
 *
 * Carga `.env.local` si existe. Dedupe: (tenantId, direction, dteType, folio)
 * y entre archivos por la misma clave (primera fila gana).
 *
 * createdAt incremental con fecha de documento ascendente → el folio más
 * nuevo del lote queda con mayor timestamp y sube en listas ordenadas por
 * createdAt desc.
 */

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

config({ path: path.resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

type Direction = "RECEIVED" | "ISSUED";

type ParsedRow = {
  direction: Direction;
  tipoDte: number;
  folio: number;
  fechaIso: string;
  montoNeto: number;
  montoExento: number;
  iva: number;
  montoTotal: number;
  /** RUT proveedor (compra) o cliente (venta), sin limpiar aún */
  counterpartyRut: string;
  counterpartyName: string;
};

function stripBom(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseChileDateToIso(raw: string): string | null {
  const s = raw.trim().split(/\s+/)[0];
  if (!s) return null;
  const p = s.split(/[/-]/);
  if (p.length < 3) return null;
  const d = Number(p[0]);
  const m = Number(p[1]);
  const y = Number(p[2]);
  if (!y || !m || !d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseAmount(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  if (s.includes(",") && !s.includes(".")) {
    return Math.round(Number(s.replace(",", ".")));
  }
  if (s.includes(".") && s.includes(",")) {
    return Math.round(Number(s.replace(/\./g, "").replace(",", ".")));
  }
  if (s.includes(".") && !s.includes(",")) {
    const parts = s.split(".");
    if (parts.length > 2) {
      return Math.round(Number(s.replace(/\./g, "")));
    }
  }
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function splitLine(line: string): string[] {
  return line.split(";").map((c) => c.trim());
}

function normHeader(h: string) {
  return h.trim().toLowerCase();
}

function colIdx(header: string[], ...candidates: string[]): number {
  const lower = header.map(normHeader);
  for (const c of candidates) {
    const i = lower.indexOf(c.toLowerCase().trim());
    if (i >= 0) return i;
  }
  return -1;
}

function detectKind(header: string[]): Direction {
  if (colIdx(header, "RUT Proveedor", "RUT proveedor") >= 0) return "RECEIVED";
  if (colIdx(header, "Tipo Compra", "tipo compra") >= 0) return "RECEIVED";
  if (colIdx(header, "Rut cliente", "RUT cliente") >= 0) return "ISSUED";
  if (colIdx(header, "Tipo Venta", "tipo venta") >= 0) return "ISSUED";
  throw new Error(
    `CSV sin columnas reconocibles (compra/venta): ${header.slice(0, 8).join(";")}`,
  );
}

function rowToParsed(header: string[], cells: string[], kind: Direction): ParsedRow | null {
  const tipoI = colIdx(header, "Tipo Doc", "tipo doc");
  const folioI = colIdx(header, "Folio", "folio");
  const fechaI = colIdx(header, "Fecha Docto", "fecha docto");
  const exI = colIdx(header, "Monto Exento", "monto exento");
  const netI = colIdx(header, "Monto Neto", "monto neto");
  const totI = colIdx(header, "Monto Total", "Monto total", "monto total");

  const tipoDte = tipoI >= 0 ? Number(cells[tipoI]) : NaN;
  const folio = folioI >= 0 ? Number(String(cells[folioI]).replace(/\s/g, "")) : NaN;
  if (!tipoDte || !folio) return null;

  const fechaRaw = fechaI >= 0 ? cells[fechaI] : "";
  const fechaIso = parseChileDateToIso(fechaRaw);
  if (!fechaIso) return null;

  let rutI: number;
  let nameI: number;
  let ivaI: number;

  if (kind === "RECEIVED") {
    rutI = colIdx(header, "RUT Proveedor", "RUT proveedor");
    nameI = colIdx(header, "Razon Social", "razon social");
    ivaI = colIdx(
      header,
      "Monto IVA Recuperable",
      "monto iva recuperable",
    );
  } else {
    rutI = colIdx(header, "Rut cliente", "RUT cliente");
    nameI = colIdx(header, "Razon Social", "razon social");
    ivaI = colIdx(header, "Monto IVA", "monto iva");
  }

  const montoExento = exI >= 0 ? parseAmount(cells[exI]) : 0;
  const montoNeto = netI >= 0 ? parseAmount(cells[netI]) : 0;
  const montoTotal = totI >= 0 ? parseAmount(cells[totI]) : 0;
  const iva = ivaI >= 0 ? parseAmount(cells[ivaI]) : 0;

  const counterpartyRut = rutI >= 0 ? cells[rutI] : "";
  const counterpartyName =
    nameI >= 0 ? cells[nameI] : `Sin nombre ${counterpartyRut}`;

  if (!String(counterpartyRut).trim()) return null;

  return {
    direction: kind,
    tipoDte,
    folio,
    fechaIso,
    montoNeto,
    montoExento,
    iva,
    montoTotal,
    counterpartyRut: String(counterpartyRut),
    counterpartyName: String(counterpartyName),
  };
}

function parseFile(filePath: string): ParsedRow[] {
  const raw = stripBom(fs.readFileSync(filePath, "latin1"));
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitLine(lines[0]);
  const kind = detectKind(header);
  const out: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.length < header.length - 2) continue;
    const p = rowToParsed(header, cells, kind);
    if (p) out.push(p);
  }
  return out;
}

function cleanRut(r: string) {
  return r.replace(/[^\dKk-]/g, "").toUpperCase();
}

async function insertReceived(
  tenantId: string,
  doc: ParsedRow,
  createdAt: Date,
): Promise<boolean> {
  const existing = await prisma.financeDte.findFirst({
    where: {
      tenantId,
      direction: "RECEIVED",
      dteType: doc.tipoDte,
      folio: doc.folio,
    },
    select: { id: true },
  });
  if (existing) return false;

  const clean = cleanRut(doc.counterpartyRut);
  const supplier = await prisma.financeSupplier.upsert({
    where: { tenantId_rut: { tenantId, rut: clean } },
    create: { tenantId, rut: clean, name: doc.counterpartyName },
    update: {},
  });

  const totalAmount = doc.montoTotal || doc.montoNeto + doc.montoExento + doc.iva;
  const netAmount = doc.montoNeto;
  const exemptAmount = doc.montoExento;
  const taxAmount = Math.round(
    doc.iva > 0 ? doc.iva : Math.max(0, totalAmount - netAmount - exemptAmount),
  );

  const code = `RCV-${doc.tipoDte}-${doc.folio}`;

  await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "RECEIVED",
      dteType: doc.tipoDte,
      folio: doc.folio,
      code,
      date: new Date(doc.fechaIso + "T12:00:00.000Z"),
      issuerRut: clean,
      issuerName: doc.counterpartyName,
      receiverRut: "",
      receiverName: "",
      currency: "CLP",
      netAmount,
      exemptAmount,
      taxRate: 19,
      taxAmount,
      totalAmount,
      siiStatus: "ACCEPTED",
      receptionStatus: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: totalAmount,
      supplierId: supplier.id,
      createdBy: "system:rcv-csv-import",
      createdAt,
    },
  });
  return true;
}

async function insertIssued(
  tenantId: string,
  doc: ParsedRow,
  createdAt: Date,
): Promise<boolean> {
  const existing = await prisma.financeDte.findFirst({
    where: {
      tenantId,
      direction: "ISSUED",
      dteType: doc.tipoDte,
      folio: doc.folio,
    },
    select: { id: true },
  });
  if (existing) return false;

  const tenantConfig = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
    select: { emisorRut: true, emisorRazonSocial: true },
  });

  const clean = cleanRut(doc.counterpartyRut);
  const totalAmount = doc.montoTotal || doc.montoNeto + doc.montoExento + doc.iva;
  const netAmount = doc.montoNeto;
  const exemptAmount = doc.montoExento;
  const taxAmount = Math.round(
    doc.iva > 0 ? doc.iva : Math.max(0, totalAmount - netAmount - exemptAmount),
  );

  const code = `RCVV-${doc.tipoDte}-${doc.folio}`;

  await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "ISSUED",
      dteType: doc.tipoDte,
      folio: doc.folio,
      code,
      date: new Date(doc.fechaIso + "T12:00:00.000Z"),
      issuerRut: tenantConfig?.emisorRut ?? "",
      issuerName: tenantConfig?.emisorRazonSocial ?? "",
      receiverRut: clean,
      receiverName: doc.counterpartyName,
      currency: "CLP",
      netAmount,
      exemptAmount,
      taxRate: 19,
      taxAmount,
      totalAmount,
      siiStatus: "ACCEPTED",
      receptionStatus: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: totalAmount,
      createdBy: "system:rcv-csv-import",
      createdAt,
    },
  });
  return true;
}

function keyFor(d: ParsedRow) {
  return `${d.direction}:${d.tipoDte}:${d.folio}`;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dry = process.argv.includes("--dry-run");

  if (args.length === 0) {
    console.error(
      "Uso: npx tsx scripts/import-rcv-csv-gard.ts [--dry-run] archivo1.csv archivo2.csv ...",
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
  if (!tenant) {
    console.error('Tenant con slug "gard" no encontrado');
    process.exit(1);
  }

  const dteCfg = await prisma.tenantDteConfig.findUnique({
    where: { tenantId: tenant.id },
    select: { emisorRut: true, isActive: true },
  });
  if (!dteCfg?.emisorRut) {
    console.warn(
      "[warn] tenant_gard sin emisorRut en tenant_dte_configs — se importa igual (ventas usarán issuer vacío si falta)",
    );
  }

  const byKey = new Map<string, ParsedRow>();
  let fileRows = 0;

  for (const f of args) {
    if (!fs.existsSync(f)) {
      console.error(`Archivo no existe: ${f}`);
      process.exit(1);
    }
    const rows = parseFile(f);
    fileRows += rows.length;
    for (const r of rows) {
      const k = keyFor(r);
      if (!byKey.has(k)) byKey.set(k, r);
    }
    console.log(`${path.basename(f)}: ${rows.length} filas válidas`);
  }

  const unique = [...byKey.values()].sort((a, b) => {
    const da = a.fechaIso.localeCompare(b.fechaIso);
    if (da !== 0) return da;
    if (a.tipoDte !== b.tipoDte) return a.tipoDte - b.tipoDte;
    return a.folio - b.folio;
  });

  console.log(
    `\nTotal filas (todos los archivos): ${fileRows} | Únicos (dedupe inter-archivo): ${unique.length}`,
  );

  if (dry) {
    console.log("[dry-run] sin escritura a BD");
    await prisma.$disconnect();
    return;
  }

  const base = Date.now();
  let seq = 0;
  let inserted = 0;
  let skippedDb = 0;

  for (const doc of unique) {
    const createdAt = new Date(base + seq++);
    try {
      const ok =
        doc.direction === "RECEIVED"
          ? await insertReceived(tenant.id, doc, createdAt)
          : await insertIssued(tenant.id, doc, createdAt);
      if (ok) inserted++;
      else skippedDb++;
    } catch (e) {
      console.error(`Error ${keyFor(doc)}:`, e);
    }
  }

  console.log(
    `\nListo. Insertados: ${inserted} | Ya existían en BD (skip): ${skippedDb}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
