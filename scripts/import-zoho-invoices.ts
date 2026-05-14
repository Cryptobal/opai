/**
 * Importa CSV de Zoho Books (Factura Zoho.csv + Notas de Crédito.csv) al
 * tenant Gard, enriqueciendo `FinanceDte` existentes o insertando los faltantes.
 *
 * Política:
 *   - Skip facturas con Status = Void (y sus NC anuladoras).
 *   - Para DTE existentes: rellena SOLO campos null/vacíos (no sobrescribe).
 *     Excepción: `paymentStatus` se actualiza si en DB es UNPAID y en Zoho
 *     está pagada (Balance=0) o cedida (Cedido=Si).
 *   - Crea `FinanceDteLine` solo si el DTE no tiene líneas.
 *   - Crea `FinanceFactoringOperation` solo si CF.Cedido=Si y no hay op previa.
 *   - Linkea referenceDteId para NCs/ND apuntando al folio referenciado.
 *   - `xmlUrl` y `pdfUrl` se guardan como URLs Cloudfront (sin descargar).
 *
 * Uso:
 *   npx tsx scripts/import-zoho-invoices.ts                # dry-run
 *   npx tsx scripts/import-zoho-invoices.ts --apply        # ejecuta
 *   npx tsx scripts/import-zoho-invoices.ts --apply --only=33,34   # solo tipos
 *
 * Carga `.env.local` si existe.
 */

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { parseString } from "fast-csv";
import { Prisma, PrismaClient } from "@prisma/client";

config({ path: path.resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

const DATA_DIR = path.resolve(process.cwd(), "scripts/zoho-import-data");
const FACTURAS_CSV = path.join(DATA_DIR, "facturas.csv");
const NC_CSV = path.join(DATA_DIR, "notas-credito.csv");
const RUTS_JSON = path.join(DATA_DIR, "customer-ruts.json");

const TENANT_SLUG = "gard";
const CREATED_BY = "system:zoho-import";
const DRY_RUN = !process.argv.includes("--apply");
const ONLY_ARG = process.argv.find((a) => a.startsWith("--only="));
const ONLY_TYPES = ONLY_ARG
  ? new Set(ONLY_ARG.slice("--only=".length).split(",").map((n) => Number(n)))
  : null;

type CustomerInfo = {
  customerNumber: string;
  customerName: string;
  rut: string;
  razonSocial?: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
};

type Refs = Array<{ tipoDocRef: string; folioRef: string; fchRef?: string }>;

type LineParsed = {
  itemName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  netAmount: number;
  taxAmount: number;
  isExempt: boolean;
};

type FacturaParsed = {
  invoiceId: string;
  folio: number;
  dteType: number;
  customerNumber: string;
  customerName: string;
  invoiceDate: Date;
  dueDate: Date | null;
  status: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  balance: number;
  exempt: boolean;
  purchaseOrder?: string;
  cedido: boolean;
  factoringName?: string;
  factoringDate?: Date | null;
  factoringResult?: string;
  factoringAecUrl?: string;
  factoringPagada?: boolean;
  trackId?: string;
  notifyEmail?: string;
  receiverEmail?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  references: Refs;
  lines: LineParsed[];
};

type NcParsed = {
  ncId: string;
  /** CF.Folio NC (cuando es Nota de Crédito 61) o CF.Folio ND (cuando es 56) */
  folio: number;
  /** 61 = nota de crédito, 56 = nota de débito */
  dteType: number;
  refFolio?: number;
  /** tipo del DTE referenciado (33 / 34 / 61) */
  refDteType: number;
  refDate?: Date | null;
  customerNumber: string;
  customerName: string;
  date: Date;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  trackId?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  reasonCode: number; // 1=anula, 2=corrige texto, 3=corrige montos
  reasonText?: string;
  lines: LineParsed[];
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers

function readCsv(filePath: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  const headers = fs.readFileSync(filePath, "utf-8").split(/\r?\n/)[0].split(",");
  const seen = new Map<string, number>();
  const dedupHeaders = headers.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h}__${n}`;
  });
  return new Promise((resolve, reject) => {
    parseString<Record<string, string>, Record<string, string>>(
      fs.readFileSync(filePath, "utf-8"),
      { headers: dedupHeaders, renameHeaders: true } as any,
    )
      .on("error", reject)
      .on("data", (r) => rows.push(r))
      .on("end", () => resolve(rows));
  });
}

function cleanRut(s: string | undefined): string {
  return (s || "").replace(/[^\dKk-]/g, "").toUpperCase();
}

function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  const str = String(s).trim().replace(/^'/, "");
  if (!str) return 0;
  const n = Number(str.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseFloat2(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).trim().replace(/^'/, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(s: string | undefined): Date | null {
  if (!s || !String(s).trim()) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
}

function tipoDteFromZoho(t: string | undefined): number {
  if (!t) return 0;
  const m = String(t).match(/\((\d+)\)/);
  return m ? Number(m[1]) : 0;
}

const REF_TYPE_MAP: Record<string, string> = {
  "Orden de compra": "801",
  "Nota de pedido": "802",
  Contrato: "803",
  HES: "HES",
};

function refType(label: string | undefined): string | null {
  if (!label) return null;
  return REF_TYPE_MAP[label.trim()] ?? label.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Parsing

function parseFacturas(rows: Record<string, string>[]): Map<string, FacturaParsed> {
  const byId = new Map<string, FacturaParsed>();
  for (const r of rows) {
    const invoiceId = r["Invoice ID"];
    if (!invoiceId) continue;
    if (r["Invoice Status"] === "Void") continue;

    if (!byId.has(invoiceId)) {
      const dteType = tipoDteFromZoho(r["CF.Tipo documento (DTE)"]);
      if (!dteType) continue;
      const folio = Number(r["CF.Folio"]);
      if (!folio) continue;
      const date = parseDate(r["Invoice Date"]);
      if (!date) continue;

      const references: Refs = [];
      for (const i of [1, 2, 3]) {
        const t = refType(r[`CF.Referencia ${i}`]);
        const f = r[`CF.Folio referencia ${i}`];
        const d = r[`CF.Fecha referencia ${i}`];
        if (t && f && String(f).trim()) {
          references.push({ tipoDocRef: t, folioRef: String(f).trim(), fchRef: d?.trim() });
        }
      }

      byId.set(invoiceId, {
        invoiceId,
        folio,
        dteType,
        customerNumber: r["Customer Number"],
        customerName: r["Customer Name"],
        invoiceDate: date,
        dueDate: parseDate(r["Due Date"]),
        status: r["Invoice Status"],
        netAmount: parseAmount(r["SubTotal"]),
        taxAmount: 0, // se acumula con líneas, o se calcula del total
        totalAmount: parseAmount(r["Total"]),
        balance: parseAmount(r["Balance"]),
        exempt: dteType === 34,
        purchaseOrder: r["PurchaseOrder"] || undefined,
        cedido: r["CF.Cedido"] === "Si",
        factoringName: r["CF.Factoring Cesion"] || r["CF.Factoring"] || undefined,
        factoringDate: parseDate(r["CF.Fecha Cesion"]),
        factoringResult: r["CF.Resultado de Cesión"] || undefined,
        factoringAecUrl: r["CF.Url Cesión"] || undefined,
        factoringPagada: r["CF.Pagada a Factoring"] === "Si",
        trackId: r["CF.Track Id"] || undefined,
        notifyEmail: r["CF.Correo notificación"] || undefined,
        receiverEmail: r["Primary Contact EmailID"] || undefined,
        xmlUrl: r["CF.XML"] || undefined,
        pdfUrl: undefined,
        references,
        lines: [],
      });
    }

    const f = byId.get(invoiceId)!;
    if (r["Item Desc"] || r["Item Name"]) {
      const itemTotal = parseAmount(r["Item Total"]);
      const itemTaxAmt = parseAmount(r["Item Tax Amount"]);
      f.lines.push({
        itemName: (r["Item Name"] || r["Sales person"] || "Servicio").slice(0, 200),
        description: (r["Item Desc"] || "").slice(0, 4000),
        quantity: parseFloat2(r["Quantity"]) || 1,
        unitPrice: parseFloat2(r["Item Price"]) || itemTotal,
        discountAmount: parseFloat2(r["Discount Amount"]),
        netAmount: itemTotal,
        taxAmount: itemTaxAmt,
        isExempt: r["Item Tax"] === "Exento IVA" || f.dteType === 34,
      });
    }
  }

  // calcular taxAmount = total - net (después de juntar líneas)
  for (const f of byId.values()) {
    f.taxAmount = Math.max(0, f.totalAmount - f.netAmount);
  }

  return byId;
}

function parseNcs(rows: Record<string, string>[]): Map<string, NcParsed> {
  const byId = new Map<string, NcParsed>();
  for (const r of rows) {
    const ncId = r["CreditNotes ID"];
    if (!ncId) continue;

    if (!byId.has(ncId)) {
      // Algunas filas son ND (Nota de Débito 56) — usar CF.Folio ND si presente
      const folioNd = r["CF.Folio ND"]?.trim();
      const folioNc = r["CF.Folio NC"]?.trim();
      const dteType = folioNd ? 56 : 61;
      const folio = Number(folioNd || folioNc);
      if (!folio) continue;

      // referenced invoice folio/type — múltiples fuentes:
      //   1. "Applied Invoice Number" (ej. "FA1330")
      //   2. "Credit Note Number" embebe la ref (ej. "NC70-FA1330")
      //   3. "CF.Folio Referencia NC" + "CF.Documento Referencia NC"
      let refFolio: number | undefined;
      let refDteType = 33;
      const tryParseRef = (s: string | undefined): { folio: number; type: number } | null => {
        if (!s) return null;
        const m = String(s).match(/(FA|FE)(\d+)/i);
        if (m) return { folio: Number(m[2]), type: m[1].toUpperCase() === "FE" ? 34 : 33 };
        return null;
      };
      const fromApplied = tryParseRef(r["Applied Invoice Number"]) ?? tryParseRef(r["Reference#"]);
      const fromNumber = tryParseRef(r["Credit Note Number"]);
      const picked = fromApplied ?? fromNumber;
      if (picked) {
        refFolio = picked.folio;
        refDteType = picked.type;
      }
      if (!refFolio) {
        const refLabel = r["CF.Documento Referencia NC"];
        const refFolioStr = r["CF.Folio Referencia NC"];
        if (refFolioStr) {
          refFolio = Number(refFolioStr);
          if (refLabel?.includes("(34)")) refDteType = 34;
        }
      }

      const docDate = parseDate(r["Credit Note Date"]);
      if (!docDate) continue;

      byId.set(ncId, {
        ncId,
        folio,
        dteType,
        refFolio,
        refDteType,
        refDate: parseDate(r["CF.Fecha referencia NC"]),
        customerNumber: r["Customer Number"],
        customerName: r["Customer Name"],
        date: docDate,
        netAmount: parseAmount(r["SubTotal"]),
        taxAmount: 0,
        totalAmount: parseAmount(r["Total"]),
        status: r["Credit Note Status"],
        trackId: r["CF.Track Id NC"] || r["CF.Track Id ND"] || undefined,
        xmlUrl: r["CF.XML NC"] || r["CF.XML ND"] || undefined,
        reasonCode: 1, // anula por defecto (todas las NC del CSV anulan)
        reasonText: r["CF.Agregar observación"] || "Anula Documento de Referencia",
        lines: [],
      });
    }

    const nc = byId.get(ncId)!;
    if (r["Item Desc"] || r["Item Name"]) {
      const itemTotal = parseAmount(r["Item Total"]);
      const itemTaxAmt = parseAmount(r["Item Tax Amount"]);
      nc.lines.push({
        itemName: (r["Item Name"] || r["Sales person"] || "Servicio").slice(0, 200),
        description: (r["Item Desc"] || "").slice(0, 4000),
        quantity: parseFloat2(r["Quantity"]) || 1,
        unitPrice: parseFloat2(r["Item Price"]) || itemTotal,
        discountAmount: parseFloat2(r["Discount Amount"]),
        netAmount: itemTotal,
        taxAmount: itemTaxAmt,
        isExempt: r["Item Tax"] === "Exento IVA" || nc.dteType === 61 && r["Tax1 ID"] === "",
      });
    }
  }

  for (const nc of byId.values()) {
    nc.taxAmount = Math.max(0, nc.totalAmount - nc.netAmount);
  }

  return byId;
}

// ─────────────────────────────────────────────────────────────────────────
// DB ops

type Stats = {
  inserted: number;
  enriched: number;
  unchanged: number;
  errors: number;
  linesAdded: number;
  factoringAdded: number;
  ncLinked: number;
  paymentStatusChanges: {
    toPaid: number;
    toCeded: number;
    toOverdue: number;
    stayUnpaid: number;
  };
};

function buildNotes(f: FacturaParsed): string {
  const parts: string[] = [];
  if (f.purchaseOrder) parts.push(`OC: ${f.purchaseOrder}`);
  for (const ref of f.references) {
    parts.push(`Ref ${ref.tipoDocRef} ${ref.folioRef}${ref.fchRef ? ` (${ref.fchRef})` : ""}`);
  }
  if (f.factoringName) parts.push(`Factoring: ${f.factoringName}`);
  // descripción del primer ítem (suele contener contexto: meses, descuento, etc.)
  const firstDesc = f.lines.find((l) => l.description?.trim())?.description?.trim();
  if (firstDesc) parts.push(firstDesc);
  return parts.join(" | ").slice(0, 4000);
}

async function upsertDte(
  tenantId: string,
  emisorRut: string,
  emisorName: string,
  f: FacturaParsed,
  customer: CustomerInfo,
  stats: Stats,
) {
  const receiverRut = cleanRut(customer.rut);
  const code = `ZOHO-${f.dteType}-${f.folio}`;

  // payment status / amounts
  let paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE" | "CEDED" = "UNPAID";
  let amountPaid = 0;
  let amountPending = f.totalAmount;
  if (f.balance === 0) {
    paymentStatus = "PAID";
    amountPaid = f.totalAmount;
    amountPending = 0;
  } else if (f.cedido) {
    paymentStatus = "CEDED";
    amountPending = 0;
  } else if (f.status === "Overdue") {
    paymentStatus = "OVERDUE";
    amountPending = f.balance;
  }

  const additionalRefs = f.references.length ? f.references : undefined;

  const existing = await prisma.financeDte.findFirst({
    where: { tenantId, direction: "ISSUED", dteType: f.dteType, folio: f.folio },
    select: {
      id: true,
      dueDate: true,
      xmlUrl: true,
      pdfUrl: true,
      receiverEmail: true,
      receiverGiro: true,
      receiverDireccion: true,
      receiverComuna: true,
      receiverCiudad: true,
      siiTrackId: true,
      notes: true,
      paymentStatus: true,
      receiverName: true,
      additionalReferences: true,
      _count: { select: { lines: true, factoringOps: true } },
    },
  });

  if (DRY_RUN) {
    if (existing) {
      stats.enriched++;
      if (existing._count.lines === 0) stats.linesAdded += f.lines.length;
      if (f.cedido && existing._count.factoringOps === 0) stats.factoringAdded++;
      if ((existing.paymentStatus === "UNPAID") && paymentStatus !== "UNPAID") {
        if (paymentStatus === "PAID") stats.paymentStatusChanges.toPaid++;
        else if (paymentStatus === "CEDED") stats.paymentStatusChanges.toCeded++;
        else if (paymentStatus === "OVERDUE") stats.paymentStatusChanges.toOverdue++;
      } else if (paymentStatus === "UNPAID") {
        stats.paymentStatusChanges.stayUnpaid++;
      }
      return;
    } else {
      stats.inserted++;
      stats.linesAdded += f.lines.length;
      if (f.cedido) stats.factoringAdded++;
      return;
    }
  }

  if (!existing) {
    // CREATE
    const dte = await prisma.financeDte.create({
      data: {
        tenantId,
        direction: "ISSUED",
        dteType: f.dteType,
        folio: f.folio,
        code,
        date: f.invoiceDate,
        dueDate: f.dueDate,
        issuerRut: emisorRut,
        issuerName: emisorName,
        receiverRut,
        receiverName: customer.razonSocial ?? customer.customerName,
        receiverEmail: f.receiverEmail || null,
        receiverGiro: customer.giro || null,
        receiverDireccion: customer.direccion || null,
        receiverComuna: customer.comuna || null,
        receiverCiudad: customer.ciudad || null,
        currency: "CLP",
        netAmount: new Prisma.Decimal(f.netAmount),
        exemptAmount: new Prisma.Decimal(f.exempt ? f.netAmount : 0),
        taxRate: f.exempt ? new Prisma.Decimal(0) : new Prisma.Decimal(19),
        taxAmount: new Prisma.Decimal(f.exempt ? 0 : f.taxAmount),
        totalAmount: new Prisma.Decimal(f.totalAmount),
        siiStatus: "ACCEPTED",
        siiTrackId: f.trackId || null,
        siiAcceptedAt: f.invoiceDate,
        receptionStatus: "PENDING_REVIEW",
        xmlUrl: f.xmlUrl || null,
        pdfUrl: f.pdfUrl || null,
        cedible: true,
        paymentStatus,
        amountPaid: new Prisma.Decimal(amountPaid),
        amountPending: new Prisma.Decimal(amountPending),
        additionalReferences: (additionalRefs as any) ?? Prisma.JsonNull,
        notes: buildNotes(f) || null,
        createdBy: CREATED_BY,
      },
      select: { id: true },
    });
    await createLines(dte.id, f.lines, stats);
    if (f.cedido) await createFactoringOp(tenantId, dte.id, f, stats);
    stats.inserted++;
  } else {
    // ENRICH only null/missing fields
    const updates: Prisma.FinanceDteUpdateInput = {};
    if (!existing.dueDate && f.dueDate) updates.dueDate = f.dueDate;
    if (!existing.xmlUrl && f.xmlUrl) updates.xmlUrl = f.xmlUrl;
    if (!existing.pdfUrl && f.pdfUrl) updates.pdfUrl = f.pdfUrl;
    if (!existing.receiverEmail && f.receiverEmail) updates.receiverEmail = f.receiverEmail;
    if (!existing.receiverGiro && customer.giro) updates.receiverGiro = customer.giro;
    if (!existing.receiverDireccion && customer.direccion) updates.receiverDireccion = customer.direccion;
    if (!existing.receiverComuna && customer.comuna) updates.receiverComuna = customer.comuna;
    if (!existing.receiverCiudad && customer.ciudad) updates.receiverCiudad = customer.ciudad;
    if (!existing.siiTrackId && f.trackId) updates.siiTrackId = f.trackId;
    if (!existing.notes && buildNotes(f)) updates.notes = buildNotes(f);

    if (
      (!existing.receiverName ||
        existing.receiverName.startsWith("Sin nombre") ||
        existing.receiverName === "") &&
      (customer.razonSocial || customer.customerName)
    ) {
      updates.receiverName = customer.razonSocial ?? customer.customerName;
    }

    if (!existing.additionalReferences && additionalRefs) {
      updates.additionalReferences = additionalRefs as any;
    }

    // paymentStatus: solo cambia si actualmente está UNPAID y Zoho dice PAID/CEDED/OVERDUE
    if (existing.paymentStatus === "UNPAID" && paymentStatus !== "UNPAID") {
      updates.paymentStatus = paymentStatus;
      updates.amountPaid = new Prisma.Decimal(amountPaid);
      updates.amountPending = new Prisma.Decimal(amountPending);
    }

    const hasUpdates = Object.keys(updates).length > 0;

    if (hasUpdates) {
      await prisma.financeDte.update({ where: { id: existing.id }, data: updates });
      stats.enriched++;
    } else {
      stats.unchanged++;
    }

    // Lines: solo crear si no hay
    if (existing._count.lines === 0 && f.lines.length > 0) {
      await createLines(existing.id, f.lines, stats);
    }
    // Factoring: solo crear si no hay y CF.Cedido=Si
    if (existing._count.factoringOps === 0 && f.cedido) {
      await createFactoringOp(tenantId, existing.id, f, stats);
    }
  }
}

async function createLines(dteId: string, lines: LineParsed[], stats: Stats) {
  if (lines.length === 0) return;
  await prisma.financeDteLine.createMany({
    data: lines.map((l, idx) => ({
      dteId,
      lineNumber: idx + 1,
      itemName: l.itemName,
      description: l.description || null,
      quantity: new Prisma.Decimal(l.quantity),
      unitPrice: new Prisma.Decimal(l.unitPrice),
      discountPct: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(l.netAmount),
      isExempt: l.isExempt,
    })),
  });
  stats.linesAdded += lines.length;
}

async function createFactoringOp(tenantId: string, dteId: string, f: FacturaParsed, stats: Stats) {
  const factoringName = f.factoringName ?? "Sin especificar";
  // determinar estado en base a "Resultado de Cesión" + "Pagada a Factoring"
  let status: "SIMULATED" | "SUBMITTED" | "APPROVED" | "FUNDED" | "COLLECTED" | "CLOSED" = "SUBMITTED";
  if (f.factoringPagada) status = "COLLECTED";
  else if (f.factoringResult?.includes("Aceptad")) status = "APPROVED";

  await prisma.financeFactoringOperation.create({
    data: {
      tenantId,
      code: `ZOHO-${f.dteType}-${f.folio}`,
      dteId,
      factoringCompany: factoringName,
      invoiceAmount: new Prisma.Decimal(f.totalAmount),
      advanceRate: new Prisma.Decimal(100),
      advanceAmount: new Prisma.Decimal(f.totalAmount),
      interestRate: new Prisma.Decimal(0),
      interestAmount: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(0),
      netAdvance: new Prisma.Decimal(f.totalAmount),
      retentionAmount: new Prisma.Decimal(0),
      status,
      cessionRegistered: !!f.factoringResult,
      cessionDate: f.factoringDate ?? null,
      cessionSiiStatus: f.factoringResult ?? null,
      cesionarioRazonSoc: factoringName,
      montoCesion: new Prisma.Decimal(f.totalAmount),
      fechaCesion: f.factoringDate ?? null,
      cessionMethod: "ELECTRONIC",
      createdBy: CREATED_BY,
      notes: "Importado desde Zoho (CF.Cedido = Si)",
    },
  });
  stats.factoringAdded++;
}

async function upsertNc(
  tenantId: string,
  emisorRut: string,
  emisorName: string,
  nc: NcParsed,
  customer: CustomerInfo,
  stats: Stats,
) {
  const receiverRut = cleanRut(customer.rut);
  const code = `ZOHO-${nc.dteType}-${nc.folio}`;

  // Lookup reference DTE by folio + type
  let refDteId: string | null = null;
  if (nc.refFolio) {
    const ref = await prisma.financeDte.findFirst({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: nc.refDteType,
        folio: nc.refFolio,
      },
      select: { id: true },
    });
    if (ref) refDteId = ref.id;
  }

  let paymentStatus: "UNPAID" | "PAID" = "PAID"; // NC son contables, no por cobrar
  const amountPending = 0;
  const amountPaid = nc.totalAmount;

  const existing = await prisma.financeDte.findFirst({
    where: { tenantId, direction: "ISSUED", dteType: nc.dteType, folio: nc.folio },
    select: {
      id: true,
      xmlUrl: true,
      receiverEmail: true,
      receiverGiro: true,
      receiverDireccion: true,
      receiverComuna: true,
      receiverCiudad: true,
      siiTrackId: true,
      referenceDteId: true,
      referenceType: true,
      referenceFolio: true,
      referenceDate: true,
      referenceCode: true,
      receiverName: true,
      _count: { select: { lines: true } },
    },
  });

  if (DRY_RUN) {
    if (existing) {
      stats.enriched++;
      if (existing._count.lines === 0) stats.linesAdded += nc.lines.length;
      if (!existing.referenceDteId && refDteId) stats.ncLinked++;
    } else {
      stats.inserted++;
      stats.linesAdded += nc.lines.length;
      if (refDteId) stats.ncLinked++;
    }
    return;
  }

  if (!existing) {
    const isExempt = nc.dteType === 61 && nc.refDteType === 34;
    const dte = await prisma.financeDte.create({
      data: {
        tenantId,
        direction: "ISSUED",
        dteType: nc.dteType,
        folio: nc.folio,
        code,
        date: nc.date,
        issuerRut: emisorRut,
        issuerName: emisorName,
        receiverRut,
        receiverName: customer.razonSocial ?? customer.customerName,
        receiverEmail: null,
        receiverGiro: customer.giro || null,
        receiverDireccion: customer.direccion || null,
        receiverComuna: customer.comuna || null,
        receiverCiudad: customer.ciudad || null,
        currency: "CLP",
        netAmount: new Prisma.Decimal(nc.netAmount),
        exemptAmount: new Prisma.Decimal(isExempt ? nc.netAmount : 0),
        taxRate: isExempt ? new Prisma.Decimal(0) : new Prisma.Decimal(19),
        taxAmount: new Prisma.Decimal(isExempt ? 0 : nc.taxAmount),
        totalAmount: new Prisma.Decimal(nc.totalAmount),
        siiStatus: "ACCEPTED",
        siiTrackId: nc.trackId || null,
        siiAcceptedAt: nc.date,
        receptionStatus: "PENDING_REVIEW",
        xmlUrl: nc.xmlUrl || null,
        pdfUrl: nc.pdfUrl || null,
        cedible: false,
        paymentStatus,
        amountPaid: new Prisma.Decimal(amountPaid),
        amountPending: new Prisma.Decimal(amountPending),
        referenceDteId: refDteId,
        referenceType: nc.refDteType,
        referenceFolio: nc.refFolio,
        referenceDate: nc.refDate ?? null,
        referenceCode: nc.reasonCode,
        referenceReason: nc.reasonText,
        notes: `${nc.reasonText} - importado desde Zoho`.slice(0, 4000),
        createdBy: CREATED_BY,
      },
      select: { id: true },
    });
    if (nc.lines.length > 0) await createLines(dte.id, nc.lines, stats);
    if (refDteId) stats.ncLinked++;
    stats.inserted++;
  } else {
    const updates: Prisma.FinanceDteUpdateInput = {};
    if (!existing.xmlUrl && nc.xmlUrl) updates.xmlUrl = nc.xmlUrl;
    if (!existing.siiTrackId && nc.trackId) updates.siiTrackId = nc.trackId;
    if (!existing.receiverGiro && customer.giro) updates.receiverGiro = customer.giro;
    if (!existing.receiverDireccion && customer.direccion) updates.receiverDireccion = customer.direccion;
    if (!existing.receiverComuna && customer.comuna) updates.receiverComuna = customer.comuna;
    if (!existing.receiverCiudad && customer.ciudad) updates.receiverCiudad = customer.ciudad;
    if (!existing.referenceDteId && refDteId) {
      updates.referenceDte = { connect: { id: refDteId } };
      updates.referenceType = nc.refDteType;
      updates.referenceFolio = nc.refFolio;
      if (nc.refDate) updates.referenceDate = nc.refDate;
      updates.referenceCode = nc.reasonCode;
      updates.referenceReason = nc.reasonText;
      stats.ncLinked++;
    }
    if (
      (!existing.receiverName ||
        existing.receiverName.startsWith("Sin nombre") ||
        existing.receiverName === "") &&
      (customer.razonSocial || customer.customerName)
    ) {
      updates.receiverName = customer.razonSocial ?? customer.customerName;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.financeDte.update({ where: { id: existing.id }, data: updates });
      stats.enriched++;
    } else {
      stats.unchanged++;
    }

    if (existing._count.lines === 0 && nc.lines.length > 0) {
      await createLines(existing.id, nc.lines, stats);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Main

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}${ONLY_TYPES ? ` (only types: ${[...ONLY_TYPES].join(",")})` : ""}`);

  const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    console.error(`Tenant '${TENANT_SLUG}' no encontrado`);
    process.exit(1);
  }
  const tenantId = tenant.id;
  const cfg = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
    select: { emisorRut: true, emisorRazonSocial: true },
  });
  const emisorRut = cfg?.emisorRut ?? "";
  const emisorName = cfg?.emisorRazonSocial ?? "";
  console.log(`Tenant: ${tenantId} | Emisor: ${emisorRut} ${emisorName}`);

  const customerMap: Record<string, CustomerInfo> = JSON.parse(fs.readFileSync(RUTS_JSON, "utf-8"));

  console.log("\nParseando CSVs…");
  const facturas = parseFacturas(await readCsv(FACTURAS_CSV));
  const ncs = parseNcs(await readCsv(NC_CSV));
  console.log(`  Facturas (no-void): ${facturas.size}`);
  console.log(`  Notas crédito/débito: ${ncs.size}`);

  const stats: Stats = {
    inserted: 0,
    enriched: 0,
    unchanged: 0,
    errors: 0,
    linesAdded: 0,
    factoringAdded: 0,
    ncLinked: 0,
    paymentStatusChanges: { toPaid: 0, toCeded: 0, toOverdue: 0, stayUnpaid: 0 },
  };

  console.log("\nProcesando facturas…");
  const facturasArr = [...facturas.values()].sort((a, b) => {
    const d = a.invoiceDate.getTime() - b.invoiceDate.getTime();
    if (d !== 0) return d;
    if (a.dteType !== b.dteType) return a.dteType - b.dteType;
    return a.folio - b.folio;
  });

  for (const f of facturasArr) {
    if (ONLY_TYPES && !ONLY_TYPES.has(f.dteType)) continue;
    const customer = customerMap[f.customerNumber];
    if (!customer) {
      console.warn(`  [skip] customer ${f.customerNumber} (${f.customerName}) sin mapping RUT — folio ${f.folio}`);
      stats.errors++;
      continue;
    }
    try {
      await upsertDte(tenantId, emisorRut, emisorName, f, customer, stats);
    } catch (e) {
      console.error(`  [error] folio ${f.folio} (${f.dteType}): ${(e as Error).message}`);
      stats.errors++;
    }
  }

  console.log("\nProcesando NC/ND…");
  const ncsArr = [...ncs.values()].sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime();
    if (d !== 0) return d;
    return a.folio - b.folio;
  });

  for (const nc of ncsArr) {
    if (ONLY_TYPES && !ONLY_TYPES.has(nc.dteType)) continue;
    const customer = customerMap[nc.customerNumber];
    if (!customer) {
      console.warn(`  [skip] NC ${nc.folio} customer ${nc.customerNumber} sin RUT`);
      stats.errors++;
      continue;
    }
    try {
      await upsertNc(tenantId, emisorRut, emisorName, nc, customer, stats);
    } catch (e) {
      console.error(`  [error] NC ${nc.folio} (${nc.dteType}): ${(e as Error).message}`);
      stats.errors++;
    }
  }

  console.log("\n=== RESUMEN ===");
  console.log(`Insertados:       ${stats.inserted}`);
  console.log(`Enriquecidos:     ${stats.enriched}`);
  console.log(`Sin cambios:      ${stats.unchanged}`);
  console.log(`Líneas creadas:   ${stats.linesAdded}`);
  console.log(`Factoring ops:    ${stats.factoringAdded}`);
  console.log(`NC linkeadas:     ${stats.ncLinked}`);
  console.log(`Errores:          ${stats.errors}`);
  console.log("\n--- paymentStatus updates (solo si actualmente UNPAID en DB) ---");
  console.log(`  → PAID:    ${stats.paymentStatusChanges.toPaid}`);
  console.log(`  → CEDED:   ${stats.paymentStatusChanges.toCeded}`);
  console.log(`  → OVERDUE: ${stats.paymentStatusChanges.toOverdue}`);
  console.log(`  ← UNPAID:  ${stats.paymentStatusChanges.stayUnpaid} (siguen sin pago en Zoho)`);
  if (DRY_RUN) console.log("\n[DRY-RUN] No se escribió nada. Usar --apply para ejecutar.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
