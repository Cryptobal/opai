/**
 * Renderer de PDF "vista previa" para DTEs.
 *
 * Genera una representación impresa SIMILAR al DTE final, pero con
 * marca clara de "VISTA PREVIA · NO EMITIDO" y SIN timbre PDF417 (no
 * existe TED hasta que se emite al SII). El propósito es que el
 * usuario valide visualmente que receptor / líneas / montos son lo
 * que espera ANTES de gastar el folio.
 *
 * Diseño deliberadamente simple — NO replica pixel-a-pixel el PDF
 * final del provider (eso es imposible sin XML firmado), pero sí
 * imita el layout SII estándar para que el usuario "vea" cómo va a
 * salir. Usa pdf-lib + StandardFonts (sin assets externos).
 *
 * No toca BD ni provider. Es 100% in-memory.
 */

import { PDFDocument, StandardFonts, rgb, RGB, degrees } from "pdf-lib";

export interface PreviewLine {
  itemName: string;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  /** Precio unitario CLP entero (mismo que sale del preview-amounts). */
  unitPrice: number;
  /** Subtotal de línea (qty * price - descuento), en CLP entero. */
  netAmount: number;
  isExempt?: boolean;
}

export interface PreviewIssuer {
  rut: string;
  razonSocial: string;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
  correo?: string | null;
  /** Logo PNG/JPG en base64 — se imprime arriba izquierda si está. */
  logoBase64?: string | null;
}

export interface PreviewReceiver {
  rut: string;
  razonSocial: string;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
}

export interface PreviewTotals {
  totalNet: number;
  totalExempt: number;
  taxRate: number; // 19 o 0
  taxAmount: number;
  totalAmount: number;
  /** Si la moneda original era UF, mostrar la conversión. */
  currency?: "CLP" | "UF";
  ufValue?: number | null;
}

export interface PreviewReference {
  tipoDocRef: string;
  folioRef: string;
  fchRef?: string | null;
  razonRef?: string | null;
}

export interface DtePreviewInput {
  dteType: number;
  /** Fecha tributaria (YYYY-MM-DD); si no viene, usa hoy. */
  date?: string | null;
  emisor: PreviewIssuer;
  receptor: PreviewReceiver;
  lines: PreviewLine[];
  totals: PreviewTotals;
  references?: PreviewReference[];
  /** Notas internas / glosa pie de página. */
  notes?: string | null;
}

const DTE_TYPE_NAMES: Record<number, string> = {
  33: "FACTURA ELECTRÓNICA",
  34: "FACTURA NO AFECTA O EXENTA ELECTRÓNICA",
  39: "BOLETA ELECTRÓNICA",
  41: "BOLETA NO AFECTA O EXENTA ELECTRÓNICA",
  43: "LIQUIDACIÓN FACTURA ELECTRÓNICA",
  46: "FACTURA DE COMPRA ELECTRÓNICA",
  52: "GUÍA DE DESPACHO ELECTRÓNICA",
  56: "NOTA DE DÉBITO ELECTRÓNICA",
  61: "NOTA DE CRÉDITO ELECTRÓNICA",
};

const REF_TYPE_LABELS: Record<string, string> = {
  "801": "ORDEN DE COMPRA",
  "802": "NOTA DE PEDIDO",
  "803": "CONTRATO",
  "804": "RESOLUCIÓN",
  HES: "HOJA DE ENTRADA SERVICIOS",
  GD: "GUÍA DE DESPACHO MANUAL",
  "33": "FACTURA",
  "34": "FACTURA EXENTA",
  "39": "BOLETA",
  "52": "GUÍA DE DESPACHO ELECTRÓNICA",
  "56": "NOTA DE DÉBITO",
  "61": "NOTA DE CRÉDITO",
};

const PAGE_WIDTH = 612; // 8.5" * 72dpi (carta)
const PAGE_HEIGHT = 792; // 11"
const MARGIN = 40;

const COLORS: Record<string, RGB> = {
  black: rgb(0, 0, 0),
  border: rgb(0.55, 0.55, 0.55),
  borderLight: rgb(0.78, 0.78, 0.78),
  watermark: rgb(0.85, 0.15, 0.15),
  watermarkBox: rgb(0.85, 0.15, 0.15),
  siiRed: rgb(0.7, 0.1, 0.1),
  gray: rgb(0.45, 0.45, 0.45),
  lightGray: rgb(0.92, 0.92, 0.92),
};

function formatRut(raw: string): string {
  const clean = raw.replace(/[^\dKk]/g, "").toUpperCase();
  if (clean.length < 2) return raw;
  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);
  // 76123456 -> 76.123.456
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-CL").format(Math.round(n));
}

function formatFechaLarga(yyyymmdd: string): string {
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const [y, m, d] = yyyymmdd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return yyyymmdd;
  return `${d} de ${meses[m - 1]} de ${y}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/**
 * Genera el PDF de vista previa de un DTE. Devuelve un Buffer listo
 * para servir como `application/pdf` o convertir a blob URL en el
 * cliente.
 */
export async function renderDtePreviewPdf(
  input: DtePreviewInput,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(
    `Vista previa — ${DTE_TYPE_NAMES[input.dteType] ?? `Tipo ${input.dteType}`}`,
  );
  pdfDoc.setProducer("OPAI Suite");
  pdfDoc.setCreationDate(new Date());

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Logo (opcional)
  let logoImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (input.emisor.logoBase64) {
    try {
      const cleanB64 = input.emisor.logoBase64.replace(
        /^data:image\/[^;]+;base64,/,
        "",
      );
      const logoBytes = Buffer.from(cleanB64, "base64");
      try {
        logoImg = await pdfDoc.embedPng(logoBytes);
      } catch {
        logoImg = await pdfDoc.embedJpg(logoBytes);
      }
    } catch {
      logoImg = null;
    }
  }

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // ───────────────────────────────────────────────
  // 1. HEADER: emisor (izq) + cuadro tipo SII (der)
  // ───────────────────────────────────────────────
  const siiBoxX = PAGE_WIDTH - MARGIN - 220;
  const siiBoxY = y - 90;
  const siiBoxW = 220;
  const siiBoxH = 90;

  page.drawRectangle({
    x: siiBoxX,
    y: siiBoxY,
    width: siiBoxW,
    height: siiBoxH,
    borderColor: COLORS.siiRed,
    borderWidth: 1.5,
  });
  drawCenteredText(page, `R.U.T.: ${formatRut(input.emisor.rut)}`, {
    x: siiBoxX,
    y: siiBoxY + siiBoxH - 20,
    w: siiBoxW,
    font: fontBold,
    size: 11,
    color: COLORS.siiRed,
  });
  drawCenteredText(
    page,
    DTE_TYPE_NAMES[input.dteType] ?? `TIPO ${input.dteType}`,
    {
      x: siiBoxX,
      y: siiBoxY + siiBoxH - 42,
      w: siiBoxW,
      font: fontBold,
      size: 10,
      color: COLORS.siiRed,
    },
  );
  // Folio: "VISTA PREVIA" en lugar del número porque NO se reservó.
  drawCenteredText(page, "N° VISTA PREVIA", {
    x: siiBoxX,
    y: siiBoxY + siiBoxH - 65,
    w: siiBoxW,
    font: fontBold,
    size: 13,
    color: COLORS.siiRed,
  });
  drawCenteredText(page, "(folio se reservará al emitir)", {
    x: siiBoxX,
    y: siiBoxY + 8,
    w: siiBoxW,
    font: fontRegular,
    size: 7,
    color: COLORS.siiRed,
  });

  // Datos del emisor a la izquierda
  const emisorMaxW = siiBoxX - MARGIN - 20;
  let emisorX = MARGIN;
  if (logoImg) {
    const targetH = 50;
    const aspect = logoImg.width / logoImg.height;
    const logoH = targetH;
    const logoW = Math.min(targetH * aspect, 140);
    page.drawImage(logoImg, {
      x: MARGIN,
      y: y - logoH,
      width: logoW,
      height: logoH,
    });
    emisorX = MARGIN + logoW + 12;
  }
  page.drawText(truncate(input.emisor.razonSocial.toUpperCase(), 60), {
    x: emisorX,
    y: y - 14,
    font: fontBold,
    size: 13,
    color: COLORS.black,
  });
  const emisorLines: string[] = [];
  if (input.emisor.giro) emisorLines.push(input.emisor.giro.toUpperCase());
  if (input.emisor.direccion) emisorLines.push(input.emisor.direccion);
  const cityLine = [input.emisor.comuna, input.emisor.ciudad]
    .filter(Boolean)
    .join(", ");
  if (cityLine) emisorLines.push(cityLine);
  if (input.emisor.telefono)
    emisorLines.push(`Fono: ${input.emisor.telefono}`);
  if (input.emisor.correo) emisorLines.push(`Email: ${input.emisor.correo}`);
  emisorLines.forEach((line, i) => {
    page.drawText(truncate(line, 80), {
      x: emisorX,
      y: y - 30 - i * 11,
      font: fontRegular,
      size: 8.5,
      color: COLORS.black,
    });
    void emisorMaxW;
  });

  y = siiBoxY - 18;

  // Fecha
  const dateStr = input.date ?? new Date().toISOString().split("T")[0];
  const cityForDate = input.emisor.comuna || input.emisor.ciudad || "Santiago";
  page.drawText(`${cityForDate}, ${formatFechaLarga(dateStr)}`, {
    x: MARGIN,
    y,
    font: fontRegular,
    size: 9,
  });
  y -= 16;

  // ───────────────────────────────────────────────
  // 2. RECEPTOR
  // ───────────────────────────────────────────────
  const recepFields: [string, string][] = (
    [
      ["SEÑOR(ES)", input.receptor.razonSocial],
      ["R.U.T.", formatRut(input.receptor.rut)],
      ["GIRO", input.receptor.giro],
      ["DIRECCIÓN", input.receptor.direccion],
      ["COMUNA", input.receptor.comuna],
      ["CIUDAD", input.receptor.ciudad],
    ] as Array<[string, string | null | undefined]>
  )
    .filter(([, v]) => v && String(v).trim().length > 0)
    .map(([label, v]) => [label, String(v)] as [string, string]);

  const FULL_WIDTH_LABELS = new Set(["SEÑOR(ES)", "GIRO"]);
  const recepFull = recepFields.filter(([l]) => FULL_WIDTH_LABELS.has(l));
  const recepTwoCol = recepFields.filter(([l]) => !FULL_WIDTH_LABELS.has(l));

  const recepBoxW = PAGE_WIDTH - 2 * MARGIN;
  const recepCellW = recepBoxW / 2;
  const LABEL_W = 78;
  const recepTwoColRows = Math.ceil(recepTwoCol.length / 2);
  const recepBoxH = (recepFull.length + recepTwoColRows) * 14 + 8;

  page.drawRectangle({
    x: MARGIN,
    y: y - recepBoxH,
    width: recepBoxW,
    height: recepBoxH,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  const FULL_CHARS = 90;
  const COL_CHARS = 40;

  let recepRow = 0;
  recepFull.forEach(([label, value]) => {
    const rowY = y - 14 - recepRow * 14;
    recepRow++;
    page.drawText(`${label}:`, { x: MARGIN + 8, y: rowY, font: fontBold, size: 8 });
    page.drawText(truncate(value.toUpperCase(), FULL_CHARS), {
      x: MARGIN + 8 + LABEL_W,
      y: rowY,
      font: fontRegular,
      size: 8,
    });
  });
  recepTwoCol.forEach(([label, value], i) => {
    const col = i % 2;
    const row = recepRow + Math.floor(i / 2);
    const cellX = MARGIN + 8 + col * recepCellW;
    const rowY = y - 14 - row * 14;
    page.drawText(`${label}:`, { x: cellX, y: rowY, font: fontBold, size: 8 });
    page.drawText(truncate(value.toUpperCase(), COL_CHARS), {
      x: cellX + LABEL_W,
      y: rowY,
      font: fontRegular,
      size: 8,
    });
  });
  y -= recepBoxH + 10;

  // ───────────────────────────────────────────────
  // 3. REFERENCIAS (si hay)
  // ───────────────────────────────────────────────
  if (input.references && input.references.length > 0) {
    const lines = input.references.map((r) => {
      const tipo = REF_TYPE_LABELS[r.tipoDocRef] ?? `REF ${r.tipoDocRef}`;
      const folio = (r.folioRef ?? "").trim();
      const fch = (r.fchRef ?? "").trim();
      const parts: string[] = [];
      parts.push(
        folio ? `${tipo} N° ${folio}` : `${tipo} (folio pendiente)`,
      );
      if (fch) parts.push(`del ${fch}`);
      if (r.razonRef) parts.push(`— ${r.razonRef}`);
      return parts.join(" ");
    });
    const refBoxH = lines.length * 12 + 18;
    page.drawRectangle({
      x: MARGIN,
      y: y - refBoxH,
      width: PAGE_WIDTH - 2 * MARGIN,
      height: refBoxH,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });
    page.drawText("REFERENCIAS:", {
      x: MARGIN + 8,
      y: y - 12,
      font: fontBold,
      size: 8,
    });
    lines.forEach((line, i) => {
      page.drawText(truncate(line, 100), {
        x: MARGIN + 8,
        y: y - 26 - i * 12,
        font: fontRegular,
        size: 8,
      });
    });
    y -= refBoxH + 8;
  }

  // ───────────────────────────────────────────────
  // 4. TABLA DETALLE
  // ───────────────────────────────────────────────
  const tableTop = y;
  const colX = {
    item: MARGIN + 4,
    detalle: MARGIN + 30,
    cantidad: PAGE_WIDTH - MARGIN - 200,
    precio: PAGE_WIDTH - MARGIN - 140,
    monto: PAGE_WIDTH - MARGIN - 65,
  };
  // Header
  page.drawRectangle({
    x: MARGIN,
    y: tableTop - 16,
    width: PAGE_WIDTH - 2 * MARGIN,
    height: 16,
    color: COLORS.lightGray,
  });
  page.drawText("Item", { x: colX.item, y: tableTop - 12, font: fontBold, size: 8 });
  page.drawText("Detalle", { x: colX.detalle, y: tableTop - 12, font: fontBold, size: 8 });
  page.drawText("Cantidad", { x: colX.cantidad, y: tableTop - 12, font: fontBold, size: 8 });
  page.drawText("Precio $", { x: colX.precio, y: tableTop - 12, font: fontBold, size: 8 });
  page.drawText("Monto $", { x: colX.monto, y: tableTop - 12, font: fontBold, size: 8 });

  let rowY = tableTop - 16;
  input.lines.forEach((l, i) => {
    rowY -= 14;
    page.drawText(String(i + 1), {
      x: colX.item,
      y: rowY,
      font: fontRegular,
      size: 8,
    });
    page.drawText(truncate(l.itemName, 65), {
      x: colX.detalle,
      y: rowY,
      font: fontRegular,
      size: 8,
    });
    page.drawText(`${l.quantity} ${l.unit ?? ""}`.trim(), {
      x: colX.cantidad,
      y: rowY,
      font: fontRegular,
      size: 8,
    });
    page.drawText(formatNumber(l.unitPrice), {
      x: colX.precio,
      y: rowY,
      font: fontRegular,
      size: 8,
    });
    page.drawText(formatNumber(l.netAmount), {
      x: colX.monto,
      y: rowY,
      font: fontRegular,
      size: 8,
    });
    // Descripción en líneas separadas (igual que el PDF final emitido)
    const desc = l.description?.trim();
    if (desc && desc !== l.itemName.trim()) {
      const subLines = desc.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      for (const sub of subLines.slice(0, 4)) {
        rowY -= 10;
        page.drawText(truncate(sub, 90), {
          x: colX.detalle,
          y: rowY,
          font: fontRegular,
          size: 7,
          color: COLORS.gray,
        });
      }
    }
    if (l.isExempt) {
      page.drawText("(exento)", {
        x: colX.detalle,
        y: rowY - 9,
        font: fontRegular,
        size: 6.5,
        color: COLORS.gray,
      });
    }
  });
  page.drawLine({
    start: { x: MARGIN, y: rowY - 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: rowY - 6 },
    thickness: 0.5,
    color: COLORS.border,
  });
  y = rowY - 20;

  // ───────────────────────────────────────────────
  // 5. TOTALES (caja a la derecha)
  // ───────────────────────────────────────────────
  const totalesX = PAGE_WIDTH - MARGIN - 200;
  const totalesW = 200;
  const totalesRows: Array<[string, number, boolean]> = [];
  if (input.totals.totalNet > 0)
    totalesRows.push(["NETO $", input.totals.totalNet, false]);
  if (input.totals.totalExempt > 0)
    totalesRows.push(["EXENTO $", input.totals.totalExempt, false]);
  if (input.totals.taxAmount > 0)
    totalesRows.push([
      `I.V.A. ${input.totals.taxRate || 19}% $`,
      input.totals.taxAmount,
      false,
    ]);
  totalesRows.push(["TOTAL $", input.totals.totalAmount, true]);

  const totalesH = totalesRows.length * 14 + 6;
  page.drawRectangle({
    x: totalesX,
    y: y - totalesH,
    width: totalesW,
    height: totalesH,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });
  totalesRows.forEach(([label, value, isBold], i) => {
    const rowYabs = y - 12 - i * 14;
    const font = isBold ? fontBold : fontRegular;
    page.drawText(label, {
      x: totalesX + 8,
      y: rowYabs,
      font,
      size: 9,
    });
    const valueText = formatNumber(value);
    const valueWidth = font.widthOfTextAtSize(valueText, 9);
    page.drawText(valueText, {
      x: totalesX + totalesW - 8 - valueWidth,
      y: rowYabs,
      font,
      size: 9,
    });
  });

  // Si la moneda original era UF, agregamos línea de equivalencia.
  if (
    input.totals.currency === "UF" &&
    input.totals.ufValue &&
    input.totals.ufValue > 0
  ) {
    const ufTotal = input.totals.totalAmount / input.totals.ufValue;
    page.drawText(
      `≈ ${ufTotal.toFixed(4)} UF (UF día = $${formatNumber(input.totals.ufValue)})`,
      {
        x: totalesX + 8,
        y: y - totalesH - 12,
        font: fontRegular,
        size: 7,
        color: COLORS.gray,
      },
    );
  }

  // ───────────────────────────────────────────────
  // 6. PLACEHOLDER del timbre PDF417 (no existe en preview)
  // ───────────────────────────────────────────────
  const timbreH = 80;
  const timbreW = 200;
  const timbreYBase = MARGIN + 60;
  page.drawRectangle({
    x: MARGIN,
    y: timbreYBase,
    width: timbreW,
    height: timbreH,
    borderColor: COLORS.borderLight,
    borderWidth: 0.7,
  });
  drawCenteredText(page, "TIMBRE ELECTRÓNICO", {
    x: MARGIN,
    y: timbreYBase + timbreH / 2 + 8,
    w: timbreW,
    font: fontBold,
    size: 9,
    color: COLORS.gray,
  });
  drawCenteredText(page, "Se generará al emitir al SII", {
    x: MARGIN,
    y: timbreYBase + timbreH / 2 - 6,
    w: timbreW,
    font: fontRegular,
    size: 8,
    color: COLORS.gray,
  });
  page.drawText("Este documento NO ha sido enviado al SII.", {
    x: MARGIN,
    y: timbreYBase - 14,
    font: fontRegular,
    size: 7,
    color: COLORS.gray,
  });
  page.drawText(
    `Generado: ${new Date().toLocaleString("es-CL")}`,
    {
      x: MARGIN,
      y: timbreYBase - 24,
      font: fontRegular,
      size: 7,
      color: COLORS.gray,
    },
  );

  // ───────────────────────────────────────────────
  // 7. Marca diagonal "VISTA PREVIA" (gigante, transparente-ish)
  // ───────────────────────────────────────────────
  // pdf-lib no soporta opacity nativa fácilmente sin GS state, así que
  // usamos color rojo claro y rotación. Es lo suficientemente visible
  // sin tapar el contenido.
  page.drawText("VISTA PREVIA", {
    x: 70,
    y: PAGE_HEIGHT / 2 - 30,
    font: fontBold,
    size: 86,
    color: COLORS.watermark,
    opacity: 0.12,
    rotate: degrees(30),
  });
  page.drawText("NO EMITIDO AL SII", {
    x: 130,
    y: PAGE_HEIGHT / 2 - 80,
    font: fontBold,
    size: 28,
    color: COLORS.watermark,
    opacity: 0.18,
    rotate: degrees(30),
  });

  // ───────────────────────────────────────────────
  // 8. Footer
  // ───────────────────────────────────────────────
  drawCenteredText(page, "VISTA PREVIA — DOCUMENTO NO VÁLIDO TRIBUTARIAMENTE", {
    x: 0,
    y: MARGIN - 5,
    w: PAGE_WIDTH,
    font: fontBold,
    size: 10,
    color: COLORS.siiRed,
  });

  if (input.notes && input.notes.trim().length > 0) {
    page.drawText(`Notas: ${truncate(input.notes, 120)}`, {
      x: MARGIN,
      y: MARGIN + 25,
      font: fontRegular,
      size: 7,
      color: COLORS.gray,
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/** Pequeño helper para texto centrado en un rect ancho `w`. */
function drawCenteredText(
  page: import("pdf-lib").PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    w: number;
    font: import("pdf-lib").PDFFont;
    size: number;
    color?: RGB;
  },
): void {
  const textWidth = opts.font.widthOfTextAtSize(text, opts.size);
  const cx = opts.x + (opts.w - textWidth) / 2;
  page.drawText(text, {
    x: cx,
    y: opts.y,
    font: opts.font,
    size: opts.size,
    color: opts.color ?? COLORS.black,
  });
}
