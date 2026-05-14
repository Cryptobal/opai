/**
 * DTE Inbound Service
 *
 * Procesa los XML de DTE recibidos por email al buzón `dte-{tenantSlug}@inbound.opai.cl`.
 * Es la fuente complementaria al sync RCV de SimpleAPI: SimpleAPI solo
 * devuelve cabezales (DetalleRCV no incluye líneas), por lo que el detalle
 * de productos / cantidades / precios solo aparece cuando el proveedor
 * manda el XML firmado por correo (obligación legal del SII en Chile).
 *
 * Flujo:
 *   1. Webhook inbound-email recibe email a `dte-{slug}@inbound.opai.cl`.
 *   2. Para cada adjunto `.xml`:
 *      a. Descarga desde Resend.
 *      b. Parsea con extractDteIdentity → tipoDte, folio, rutEmisor, rutReceptor, total.
 *      c. Valida que rutReceptor == TenantDteConfig.emisorRut del tenant. Si no
 *         coincide, descarta (no es nuestro DTE).
 *      d. Upsert FinanceDte (direction=RECEIVED) idempotente por
 *         (tenantId, direction, dteType, folio):
 *           - No existe → crea cabezal + líneas desde el XML.
 *           - Existe sin líneas → enriquece líneas + cabezal vacío + dteXml.
 *           - Existe con líneas → solo adjunta el archivo (idempotente).
 *      e. Sube el XML a R2 y crea FinanceDteAttachment kind=XML.
 *   3. Para adjuntos PDF: si llegó junto a un XML válido del mismo email,
 *      se adjunta al mismo FinanceDte como kind=PDF.
 */

import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import {
  extractDteIdentity,
  extractDteLines,
  parseDteXml,
  type DteParsed,
} from "@/lib/dte-xml-parser";

/**
 * Adjunto crudo tal cual lo entrega Resend en el webhook + el buffer
 * ya descargado. El caller (webhook) descarga primero porque maneja
 * la auth de Resend, y le pasa al servicio el binario listo.
 */
export interface InboundAttachment {
  id: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}

export interface InboundDteResult {
  /** Adjuntos procesados como XML → cantidad de DTEs upserteados. */
  xmlProcessed: number;
  xmlSkipped: number;
  /** Adjuntos PDF asociados al primer FinanceDte creado/encontrado en el email. */
  pdfsAttached: number;
  /** FinanceDte.id de cada DTE upserteado. */
  dteIds: string[];
  /** Razones de skip (para logging). */
  skipReasons: string[];
}

/** Normaliza un RUT para comparar (quita puntos, guiones, espacios). */
function rutKey(rut: string | null | undefined): string {
  return (rut ?? "").replace(/[.\-\s]/g, "").toUpperCase();
}

/** Formato canónico de RUT para persistir (sin puntos, con guión, K mayúscula). */
function rutCanonical(rut: string): string {
  const compact = rut.replace(/[^\dKk-]/g, "").toUpperCase();
  return compact;
}

/**
 * Procesa todos los adjuntos de un email entrante al buzón `dte-{slug}@`.
 * Idempotente: se puede re-correr el mismo email sin duplicar datos.
 */
export async function ingestDtesFromInboundEmail(opts: {
  tenantId: string;
  emailId: string;
  fromEmail: string;
  subject: string;
  attachments: InboundAttachment[];
}): Promise<InboundDteResult> {
  const { tenantId, emailId, fromEmail, subject, attachments } = opts;

  const result: InboundDteResult = {
    xmlProcessed: 0,
    xmlSkipped: 0,
    pdfsAttached: 0,
    dteIds: [],
    skipReasons: [],
  };

  // RUT del tenant — necesario para validar que el DTE va a nosotros.
  const cfg = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
    select: { emisorRut: true },
  });
  if (!cfg?.emisorRut) {
    result.skipReasons.push("tenant_sin_emisor_rut");
    return result;
  }
  const tenantRutKey = rutKey(cfg.emisorRut);

  // Particiona adjuntos: XMLs primero, PDFs después (se ligan al último XML upserteado).
  const xmlAttachments = attachments.filter((a) =>
    isXmlAttachment(a.filename, a.contentType),
  );
  const pdfAttachments = attachments.filter((a) =>
    isPdfAttachment(a.filename, a.contentType),
  );

  for (const att of xmlAttachments) {
    try {
      const dteId = await processInboundXml({
        tenantId,
        tenantRutKey,
        xmlBuffer: att.buffer,
        filename: att.filename,
        contentType: att.contentType,
        fromEmail,
        subject,
        emailId,
      });
      if (dteId) {
        result.xmlProcessed++;
        result.dteIds.push(dteId);
      } else {
        result.xmlSkipped++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[dte-inbound] XML rechazado (${att.filename}): ${msg}`,
      );
      result.xmlSkipped++;
      result.skipReasons.push(`xml_invalid:${att.filename}:${msg}`);
    }
  }

  // PDFs solo se adjuntan si hay al menos un DTE del email — los ligamos
  // al primero (caso típico: el correo trae 1 XML + 1 PDF del mismo DTE).
  if (pdfAttachments.length > 0 && result.dteIds.length > 0) {
    const targetDteId = result.dteIds[0];
    for (const pdf of pdfAttachments) {
      try {
        await attachPdfToDte({
          tenantId,
          dteId: targetDteId,
          filename: pdf.filename,
          contentType: pdf.contentType,
          buffer: pdf.buffer,
        });
        result.pdfsAttached++;
      } catch (err) {
        console.warn(
          `[dte-inbound] PDF skip (${pdf.filename}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return result;
}

function isXmlAttachment(filename: string, contentType: string): boolean {
  const fn = filename.toLowerCase();
  const ct = contentType.toLowerCase();
  return (
    fn.endsWith(".xml") ||
    ct.includes("xml") ||
    ct.includes("application/x-xml")
  );
}

function isPdfAttachment(filename: string, contentType: string): boolean {
  const fn = filename.toLowerCase();
  const ct = contentType.toLowerCase();
  return fn.endsWith(".pdf") || ct.includes("pdf");
}

/**
 * Procesa un XML adjunto: valida, upsertea el DTE recibido y guarda el
 * XML como FinanceDteAttachment (kind=XML).
 *
 * @returns dteId si se upserteó, null si se descartó (RUT mismatch, etc.).
 */
async function processInboundXml(opts: {
  tenantId: string;
  tenantRutKey: string;
  xmlBuffer: Buffer;
  filename: string;
  contentType: string;
  fromEmail: string;
  subject: string;
  emailId: string;
}): Promise<string | null> {
  const {
    tenantId,
    tenantRutKey,
    xmlBuffer,
    filename,
    contentType,
    fromEmail,
    emailId,
  } = opts;

  // Identidad mínima (no requiere TED, tolera XMLs de portal SII).
  const identity = extractDteIdentity(xmlBuffer);

  // Validación crítica: el RUT receptor del XML DEBE ser nuestro tenant.
  if (rutKey(identity.rutReceptor) !== tenantRutKey) {
    console.warn(
      `[dte-inbound] RUT mismatch — XML receptor=${identity.rutReceptor}, tenant=${tenantRutKey}. Descartado.`,
    );
    return null;
  }

  // Idempotencia: lookup por unique (tenantId, direction, dteType, folio).
  const existing = await prisma.financeDte.findFirst({
    where: {
      tenantId,
      direction: "RECEIVED",
      dteType: identity.tipoDte,
      folio: identity.folio,
    },
    select: {
      id: true,
      dteXml: true,
      _count: { select: { lines: true } },
    },
  });

  let dteId: string;
  if (existing) {
    dteId = await enrichExistingDte({
      dteId: existing.id,
      hasLines: existing._count.lines > 0,
      hasXml: !!existing.dteXml && existing.dteXml.length > 0,
      xmlBuffer,
    });
  } else {
    dteId = await createDteFromXml({
      tenantId,
      xmlBuffer,
      identity,
    });
  }

  // Adjunta el archivo XML al DTE (siempre que no esté ya el mismo filename).
  await attachXmlToDte({
    tenantId,
    dteId,
    filename,
    contentType,
    buffer: xmlBuffer,
    fromEmail,
    emailId,
  });

  return dteId;
}

/**
 * El DTE ya existe (típicamente bajado por sync RCV con cabezal solo).
 * Enriquecemos lo que falte: líneas desde <Detalle>, dteXml.
 */
async function enrichExistingDte(opts: {
  dteId: string;
  hasLines: boolean;
  hasXml: boolean;
  xmlBuffer: Buffer;
}): Promise<string> {
  const { dteId, hasLines, hasXml, xmlBuffer } = opts;

  const linesFromXml = hasLines
    ? []
    : extractDteLines(xmlBuffer).filter((l) => l.itemName.trim().length > 0);

  await prisma.financeDte.update({
    where: { id: dteId },
    data: {
      ...(hasXml ? {} : { dteXml: new Uint8Array(xmlBuffer) }),
      ...(linesFromXml.length > 0
        ? {
            lines: {
              create: linesFromXml.map((l) => ({
                lineNumber: l.lineNumber,
                itemCode: l.itemCode,
                itemName: l.itemName,
                description: l.description,
                quantity: l.quantity,
                unit: l.unit,
                unitPrice: l.unitPrice,
                netAmount: l.netAmount,
                isExempt: l.isExempt,
              })),
            },
          }
        : {}),
    },
  });

  return dteId;
}

/**
 * El DTE no existía (llegó por email antes que SimpleAPI lo bajara, o
 * SimpleAPI no lo trajo). Creamos cabezal + líneas desde el XML completo.
 */
async function createDteFromXml(opts: {
  tenantId: string;
  xmlBuffer: Buffer;
  identity: {
    tipoDte: number;
    folio: number;
    rutEmisor: string;
    rutReceptor: string;
    total: number;
  };
}): Promise<string> {
  const { tenantId, xmlBuffer, identity } = opts;

  let parsed: DteParsed;
  try {
    parsed = parseDteXml(xmlBuffer);
  } catch {
    // Si no podemos parsear completo (sin TED), creamos cabezal mínimo
    // desde identity y dejamos líneas/datos secundarios vacíos.
    return createMinimalDteFromIdentity({ tenantId, xmlBuffer, identity });
  }

  const supplier = await upsertSupplier({
    tenantId,
    rut: parsed.emisor.rut,
    name: parsed.emisor.razonSocial,
  });

  const total = Math.round(parsed.totales.total);
  const neto = Math.round(parsed.totales.neto);
  const exento = Math.round(parsed.totales.exento);
  const iva = Math.round(parsed.totales.iva);

  const created = await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "RECEIVED",
      dteType: parsed.tipoDte,
      folio: parsed.folio,
      code: `RCV-${parsed.tipoDte}-${parsed.folio}`,
      date: new Date(parsed.fechaEmision),
      issuerRut: rutCanonical(parsed.emisor.rut),
      issuerName: parsed.emisor.razonSocial,
      receiverRut: rutCanonical(parsed.receptor.rut),
      receiverName: parsed.receptor.razonSocial,
      currency: "CLP",
      netAmount: neto,
      exemptAmount: exento,
      taxRate: parsed.totales.tasaIva || 19,
      taxAmount: iva,
      totalAmount: total,
      siiStatus: "ACCEPTED",
      receptionStatus: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: total,
      supplierId: supplier.id,
      createdBy: "system:dte-inbound-email",
      dteXml: new Uint8Array(xmlBuffer),
      lines: {
        create: parsed.lineas
          .filter((l) => l.nombre.trim().length > 0)
          .map((l) => ({
            lineNumber: l.nroLinea,
            itemCode: l.codigo,
            itemName: l.nombre,
            description: l.descripcion,
            quantity: l.cantidad,
            unit: l.unidad,
            unitPrice: l.precio,
            netAmount: l.monto,
            isExempt: l.isExempt,
          })),
      },
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * Fallback cuando parseDteXml falla (ej. XML sin TED). Creamos un DTE
 * mínimo con la identidad y dejamos que el usuario complete después.
 * Igual guardamos el XML como bytes para tenerlo en el futuro.
 */
async function createMinimalDteFromIdentity(opts: {
  tenantId: string;
  xmlBuffer: Buffer;
  identity: { tipoDte: number; folio: number; rutEmisor: string; rutReceptor: string; total: number };
}): Promise<string> {
  const { tenantId, xmlBuffer, identity } = opts;

  // Intentar líneas best-effort sin TED.
  let lines: ReturnType<typeof extractDteLines> = [];
  try {
    lines = extractDteLines(xmlBuffer).filter((l) => l.itemName.trim().length > 0);
  } catch {
    lines = [];
  }

  const supplier = await upsertSupplier({
    tenantId,
    rut: identity.rutEmisor,
    name: `Proveedor ${identity.rutEmisor}`,
  });

  const total = Math.round(identity.total);

  const created = await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "RECEIVED",
      dteType: identity.tipoDte,
      folio: identity.folio,
      code: `RCV-${identity.tipoDte}-${identity.folio}`,
      date: new Date(),
      issuerRut: rutCanonical(identity.rutEmisor),
      issuerName: `Proveedor ${identity.rutEmisor}`,
      receiverRut: rutCanonical(identity.rutReceptor),
      receiverName: "",
      currency: "CLP",
      netAmount: 0,
      exemptAmount: 0,
      taxRate: 19,
      taxAmount: 0,
      totalAmount: total,
      siiStatus: "ACCEPTED",
      receptionStatus: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: total,
      supplierId: supplier.id,
      createdBy: "system:dte-inbound-email",
      dteXml: new Uint8Array(xmlBuffer),
      ...(lines.length > 0
        ? {
            lines: {
              create: lines.map((l) => ({
                lineNumber: l.lineNumber,
                itemCode: l.itemCode,
                itemName: l.itemName,
                description: l.description,
                quantity: l.quantity,
                unit: l.unit,
                unitPrice: l.unitPrice,
                netAmount: l.netAmount,
                isExempt: l.isExempt,
              })),
            },
          }
        : {}),
    },
    select: { id: true },
  });

  return created.id;
}

async function upsertSupplier(opts: {
  tenantId: string;
  rut: string;
  name: string;
}) {
  const rut = rutCanonical(opts.rut);
  return prisma.financeSupplier.upsert({
    where: { tenantId_rut: { tenantId: opts.tenantId, rut } },
    create: { tenantId: opts.tenantId, rut, name: opts.name },
    update: {},
  });
}

async function attachXmlToDte(opts: {
  tenantId: string;
  dteId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
  fromEmail: string;
  emailId: string;
}): Promise<void> {
  // Idempotencia: si ya existe un XML adjunto con el mismo nombre, skip.
  const existing = await prisma.financeDteAttachment.findFirst({
    where: {
      dteId: opts.dteId,
      kind: "XML",
      filename: opts.filename,
    },
    select: { id: true },
  });
  if (existing) return;

  const uploaded = await uploadFile(
    opts.buffer,
    opts.filename,
    opts.contentType || "application/xml",
    "finance",
    opts.tenantId,
  );

  await prisma.financeDteAttachment.create({
    data: {
      tenantId: opts.tenantId,
      dteId: opts.dteId,
      kind: "XML",
      filename: uploaded.fileName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      storageKey: uploaded.storageKey,
      publicUrl: uploaded.publicUrl || null,
      uploadedBy: `system:dte-inbound-email:${opts.emailId}`,
    },
  });
}

async function attachPdfToDte(opts: {
  tenantId: string;
  dteId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}): Promise<void> {
  const existing = await prisma.financeDteAttachment.findFirst({
    where: {
      dteId: opts.dteId,
      kind: "PDF",
      filename: opts.filename,
    },
    select: { id: true },
  });
  if (existing) return;

  const uploaded = await uploadFile(
    opts.buffer,
    opts.filename,
    opts.contentType || "application/pdf",
    "finance",
    opts.tenantId,
  );

  await prisma.financeDteAttachment.create({
    data: {
      tenantId: opts.tenantId,
      dteId: opts.dteId,
      kind: "PDF",
      filename: uploaded.fileName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      storageKey: uploaded.storageKey,
      publicUrl: uploaded.publicUrl || null,
      uploadedBy: "system:dte-inbound-email",
    },
  });
}

