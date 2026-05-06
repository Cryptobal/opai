/**
 * Renderer local de PDF para DTEs chilenos.
 *
 * Genera la representación impresa del DTE (formato carta, tamaño SII)
 * a partir del XML firmado, sin depender del proveedor externo. Esto
 * nos da control total sobre el layout (limpio, estilo iPapers) y
 * elimina campos vacíos que SimpleAPI siempre muestra.
 *
 * Layout (replica el de iPapers/LibreDTE):
 *
 *   ┌─ Logo ────────┐  ┌─ R.U.T. emisor ───────────┐
 *   │ Razón social  │  │ TIPO DTE                  │
 *   │ Giro          │  │ N° folio                  │
 *   │ Dirección     │  │ S.I.I. — UnidadSII        │
 *   └───────────────┘  └───────────────────────────┘
 *   Sucursal/Ciudad, Fecha
 *   ┌─ Receptor ────────────────────────────────────┐
 *   │ SEÑOR(ES): xxx  R.U.T.: xxx                   │
 *   │ GIRO: xxx       DIRECCIÓN: xxx                │
 *   │ COMUNA: xxx     CIUDAD: xxx                   │
 *   └───────────────────────────────────────────────┘
 *   ┌─ Referencias (si hay) ────────────────────────┐
 *   │ ORDEN DE COMPRA Folio:xxx del YYYY-MM-DD      │
 *   └───────────────────────────────────────────────┘
 *   ┌─ Detalle ─────────────────────────────────────┐
 *   │ Item Detalle    Cantidad  Precio  Monto       │
 *   │ 1    Servicio   1         X       X           │
 *   └───────────────────────────────────────────────┘
 *                                          ┌─ Totales ─┐
 *                                          │ NETO      │
 *                                          │ IVA 19%   │
 *                                          │ EXENTO    │
 *                                          │ TOTAL     │
 *                                          └───────────┘
 *   ┌─ Timbre PDF417 ──────┐
 *   │ [PDF417 image]       │ Resolución: X del YYYY-MM-DD
 *   │                      │ Timbre Electrónico S.I.I.
 *   └──────────────────────┘ Verifique Documento: www.sii.cl
 *
 * Para tipos cedibles agrega una segunda página con:
 *   - El mismo layout pero con marca "CEDIBLE" en el header
 *   - Texto legal Ley 19.983 (acuse de recibo)
 *   - Casillas: NOMBRE / RUT / FECHA / FIRMA
 */

import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, RGB } from "pdf-lib";
// `bwip-js/node` apunta explícitamente al build Node.js (que usa Buffer
// y APIs de filesystem). El `bwip-js` por defecto resuelve por exports
// map a la misma cosa en Node, pero en algunos bundlers (Next.js
// webpack) puede caer al build browser y explotar al usar Buffer.
import bwipjs from "bwip-js/node";
import {
  getDteTypeName,
  getReferenciaTipoName,
  montoEnPalabras,
  type DteParsed,
} from "./dte-xml-parser";

export interface DtePdfRenderOptions {
  /** Logo del emisor en base64 (PNG/JPG). Se imprime arriba a la izquierda. */
  logoBase64?: string | null;
  /** Número de resolución SII del emisor (ej. 80). */
  numeroResolucion: number;
  /** Fecha de la resolución SII (Date o string YYYY-MM-DD). */
  fechaResolucion: string | Date;
  /** Unidad regional del SII (ej. "S.I.I. - SANTIAGO ORIENTE"). Opcional. */
  unidadSii?: string | null;
  /** Si true, agrega la página CEDIBLE (Ley 19.983). Auto si dteType en {33,34,43,56,61}. */
  cedible?: boolean;
}

/** Tipos DTE que llevan copia cedible por defecto. */
const TYPES_WITH_CEDIBLE = new Set([33, 34, 43, 56, 61]);

const COLORS: Record<string, RGB> = {
  black: rgb(0, 0, 0),
  border: rgb(0.4, 0.4, 0.4),
  borderDark: rgb(0.2, 0.2, 0.2),
  // Color del marco rojo del header SII (igual al estándar tributario chileno)
  siiRed: rgb(0.7, 0.1, 0.1),
  gray: rgb(0.5, 0.5, 0.5),
  lightGray: rgb(0.92, 0.92, 0.92),
};

// Carta tamaño SII chileno: usamos LETTER (612 x 792 puntos = 8.5"x11").
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 30;

/**
 * Renderiza un DTE como PDF Buffer. Devuelve los bytes del PDF
 * resultante listos para servir.
 */
export async function renderDtePdf(
  dte: DteParsed,
  options: DtePdfRenderOptions,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`DTE ${dte.tipoDte}-${dte.folio}`);
  pdfDoc.setAuthor(dte.emisor.razonSocial);
  pdfDoc.setProducer("OPAI Suite");
  pdfDoc.setCreationDate(new Date());

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Generar el PDF417 del TED (timbre electrónico) — mismo bytes para
  // ambas páginas (original y cedible).
  const timbrePng = await generatePdf417(dte.ted);
  const timbreImage = await pdfDoc.embedPng(timbrePng);

  // Logo del emisor (opcional)
  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (options.logoBase64) {
    try {
      const cleanB64 = options.logoBase64.replace(/^data:image\/[^;]+;base64,/, "");
      const logoBytes = Buffer.from(cleanB64, "base64");
      // Intentar PNG; si falla, JPG.
      try {
        logoImage = await pdfDoc.embedPng(logoBytes);
      } catch {
        logoImage = await pdfDoc.embedJpg(logoBytes);
      }
    } catch {
      logoImage = null;
    }
  }

  const includeCedible = options.cedible ?? TYPES_WITH_CEDIBLE.has(dte.tipoDte);

  // Página ORIGINAL
  const page1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  await renderDtePage(page1, dte, options, {
    fontRegular,
    fontBold,
    timbreImage,
    logoImage,
    isCedible: false,
  });

  // Página CEDIBLE (si aplica)
  if (includeCedible) {
    const page2 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    await renderDtePage(page2, dte, options, {
      fontRegular,
      fontBold,
      timbreImage,
      logoImage,
      isCedible: true,
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

interface RenderContext {
  fontRegular: PDFFont;
  fontBold: PDFFont;
  timbreImage: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  logoImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null;
  isCedible: boolean;
}

/**
 * Renderiza UNA página del DTE (original o cedible). Las dos páginas
 * comparten layout — solo difiere el header (ORIGINAL/CEDIBLE) y la
 * sección de acuse de recibo al pie en la cedible.
 */
async function renderDtePage(
  page: PDFPage,
  dte: DteParsed,
  options: DtePdfRenderOptions,
  ctx: RenderContext,
): Promise<void> {
  let y = PAGE_HEIGHT - MARGIN;

  // ─────────────────────────────────────────────
  // 1. HEADER: emisor (izq) + cuadro SII rojo (der)
  // ─────────────────────────────────────────────
  const siiBoxX = PAGE_WIDTH - MARGIN - 200;
  const siiBoxY = y - 80;
  const siiBoxW = 200;
  const siiBoxH = 80;

  page.drawRectangle({
    x: siiBoxX,
    y: siiBoxY,
    width: siiBoxW,
    height: siiBoxH,
    borderColor: COLORS.siiRed,
    borderWidth: 1.5,
  });

  drawCenteredText(page, `R.U.T.: ${formatRut(dte.emisor.rut)}`, {
    x: siiBoxX,
    y: siiBoxY + siiBoxH - 18,
    w: siiBoxW,
    font: ctx.fontBold,
    size: 11,
    color: COLORS.siiRed,
  });
  drawCenteredText(page, getDteTypeName(dte.tipoDte), {
    x: siiBoxX,
    y: siiBoxY + siiBoxH - 38,
    w: siiBoxW,
    font: ctx.fontBold,
    size: 12,
    color: COLORS.siiRed,
  });
  drawCenteredText(page, `N° ${dte.folio}`, {
    x: siiBoxX,
    y: siiBoxY + siiBoxH - 60,
    w: siiBoxW,
    font: ctx.fontBold,
    size: 16,
    color: COLORS.siiRed,
  });
  drawCenteredText(page, options.unidadSii || "S.I.I.", {
    x: siiBoxX,
    y: siiBoxY + 6,
    w: siiBoxW,
    font: ctx.fontBold,
    size: 8,
    color: COLORS.siiRed,
  });

  // Datos del emisor a la izquierda — máximo ancho para no chocar con SII.
  const emisorMaxW = siiBoxX - MARGIN - 20;
  let emisorX = MARGIN;
  let emisorTop = y;
  if (ctx.logoImage) {
    const targetH = 50;
    const aspect = ctx.logoImage.width / ctx.logoImage.height;
    const logoH = targetH;
    const logoW = Math.min(targetH * aspect, 140);
    page.drawImage(ctx.logoImage, {
      x: MARGIN,
      y: emisorTop - logoH,
      width: logoW,
      height: logoH,
    });
    emisorX = MARGIN + logoW + 12;
  }

  const razonSocial = truncateToWidth(
    dte.emisor.razonSocial.toUpperCase(),
    ctx.fontBold,
    13,
    emisorMaxW - (emisorX - MARGIN),
  );
  page.drawText(razonSocial, {
    x: emisorX,
    y: emisorTop - 14,
    font: ctx.fontBold,
    size: 13,
    color: COLORS.black,
  });

  const emisorLines: string[] = [];
  if (dte.emisor.giro) emisorLines.push(dte.emisor.giro.toUpperCase());
  if (dte.emisor.direccion) emisorLines.push(dte.emisor.direccion);
  const cityLine = [dte.emisor.comuna, dte.emisor.ciudad]
    .filter(Boolean)
    .join(", ");
  if (cityLine) emisorLines.push(cityLine);
  if (dte.emisor.telefono) emisorLines.push(`Fono: ${dte.emisor.telefono}`);
  if (dte.emisor.correo) emisorLines.push(`Email: ${dte.emisor.correo}`);

  emisorLines.forEach((line, i) => {
    const text = truncateToWidth(
      line,
      ctx.fontRegular,
      8.5,
      emisorMaxW - (emisorX - MARGIN),
    );
    page.drawText(text, {
      x: emisorX,
      y: emisorTop - 30 - i * 11,
      font: ctx.fontRegular,
      size: 8.5,
      color: COLORS.black,
    });
  });

  y = siiBoxY - 18;

  // ─────────────────────────────────────────────
  // 2. Línea de fecha (debajo del header)
  // ─────────────────────────────────────────────
  const cityForDate = dte.emisor.comuna || dte.emisor.ciudad || "Santiago";
  page.drawText(
    `${cityForDate}, ${formatFechaLarga(dte.fechaEmision)}`,
    {
      x: MARGIN,
      y,
      font: ctx.fontRegular,
      size: 9,
      color: COLORS.black,
    },
  );
  y -= 16;

  // ─────────────────────────────────────────────
  // 3. CUADRO RECEPTOR — un campo por fila full-width
  // ─────────────────────────────────────────────
  const recepBoxY = y;
  const recepFields: Array<[string, string]> = (
    [
      ["SEÑOR(ES)", dte.receptor.razonSocial],
      ["R.U.T.", formatRut(dte.receptor.rut)],
      ["GIRO", dte.receptor.giro],
      ["DIRECCIÓN", dte.receptor.direccion],
      ["COMUNA", dte.receptor.comuna],
      ["CIUDAD", dte.receptor.ciudad],
    ] as Array<[string, string | null | undefined]>
  )
    .filter(([, v]) => v && String(v).trim().length > 0)
    .map(([label, v]) => [label, String(v)] as [string, string]);

  // Layout 2 columnas — cada celda con label propio y value truncado al ancho
  // disponible para no solaparse con la siguiente columna.
  const recepRows = Math.ceil(recepFields.length / 2);
  const recepBoxH = recepRows * 14 + 8;
  const recepBoxW = PAGE_WIDTH - 2 * MARGIN;
  const recepCellW = recepBoxW / 2;
  const recepLabelW = 78;
  const recepValueMaxW = recepCellW - recepLabelW - 16;

  page.drawRectangle({
    x: MARGIN,
    y: recepBoxY - recepBoxH,
    width: recepBoxW,
    height: recepBoxH,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  recepFields.forEach((field, i) => {
    const [label, value] = field;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cellX = MARGIN + 8 + col * recepCellW;
    const rowY = recepBoxY - 14 - row * 14;
    page.drawText(`${label}:`, {
      x: cellX,
      y: rowY,
      font: ctx.fontBold,
      size: 8,
      color: COLORS.black,
    });
    const valueText = truncateToWidth(
      String(value ?? "").toUpperCase(),
      ctx.fontRegular,
      8,
      recepValueMaxW,
    );
    page.drawText(valueText, {
      x: cellX + recepLabelW,
      y: rowY,
      font: ctx.fontRegular,
      size: 8,
      color: COLORS.black,
    });
  });

  y = recepBoxY - recepBoxH - 10;

  // ─────────────────────────────────────────────
  // 4. CUADRO REFERENCIAS (si hay)
  // ─────────────────────────────────────────────
  if (dte.referencias.length > 0) {
    const refsLines: string[] = dte.referencias.map((r) => {
      const tipo = getReferenciaTipoName(r.tipoDoc);
      const parts = [`${tipo} N° ${r.folio}`];
      if (r.fecha) parts.push(`del ${r.fecha}`);
      if (r.razon) parts.push(`— ${r.razon}`);
      return parts.join(" ");
    });
    const refBoxH = refsLines.length * 12 + 18;
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
      font: ctx.fontBold,
      size: 8,
      color: COLORS.black,
    });
    refsLines.forEach((line, i) => {
      page.drawText(line.slice(0, 100), {
        x: MARGIN + 8,
        y: y - 26 - i * 12,
        font: ctx.fontRegular,
        size: 8,
        color: COLORS.black,
      });
    });
    y -= refBoxH + 8;
  }

  // ─────────────────────────────────────────────
  // 5. TABLA DE DETALLE
  // ─────────────────────────────────────────────
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
  page.drawText("Item", {
    x: colX.item,
    y: tableTop - 12,
    font: ctx.fontBold,
    size: 8,
  });
  page.drawText("Detalle", {
    x: colX.detalle,
    y: tableTop - 12,
    font: ctx.fontBold,
    size: 8,
  });
  page.drawText("Cantidad", {
    x: colX.cantidad,
    y: tableTop - 12,
    font: ctx.fontBold,
    size: 8,
  });
  page.drawText("Precio $", {
    x: colX.precio,
    y: tableTop - 12,
    font: ctx.fontBold,
    size: 8,
  });
  page.drawText("Monto $", {
    x: colX.monto,
    y: tableTop - 12,
    font: ctx.fontBold,
    size: 8,
  });

  // Filas
  let rowY = tableTop - 16;
  for (const linea of dte.lineas) {
    rowY -= 14;
    page.drawText(String(linea.nroLinea), {
      x: colX.item,
      y: rowY,
      font: ctx.fontRegular,
      size: 8,
    });
    const detalleText =
      linea.nombre +
      (linea.descripcion ? ` — ${linea.descripcion}` : "");
    page.drawText(detalleText.slice(0, 50), {
      x: colX.detalle,
      y: rowY,
      font: ctx.fontRegular,
      size: 8,
    });
    page.drawText(
      `${linea.cantidad} ${linea.unidad ?? ""}`.trim(),
      {
        x: colX.cantidad,
        y: rowY,
        font: ctx.fontRegular,
        size: 8,
      },
    );
    page.drawText(formatNumber(linea.precio), {
      x: colX.precio,
      y: rowY,
      font: ctx.fontRegular,
      size: 8,
    });
    page.drawText(formatNumber(linea.monto), {
      x: colX.monto,
      y: rowY,
      font: ctx.fontRegular,
      size: 8,
    });
  }

  // Borde inferior de la tabla
  page.drawLine({
    start: { x: MARGIN, y: rowY - 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: rowY - 6 },
    thickness: 0.5,
    color: COLORS.border,
  });

  y = rowY - 20;

  // Monto en palabras
  page.drawText(
    `SON ${montoEnPalabras(dte.totales.total)} PESOS`,
    {
      x: MARGIN,
      y,
      font: ctx.fontRegular,
      size: 8,
      color: COLORS.gray,
    },
  );
  y -= 18;

  // ─────────────────────────────────────────────
  // 6. TOTALES (caja a la derecha)
  // ─────────────────────────────────────────────
  const totalesX = PAGE_WIDTH - MARGIN - 200;
  const totalesW = 200;
  const totalesRows: Array<[string, number, boolean]> = [];
  if (dte.totales.neto > 0) {
    totalesRows.push(["NETO $", dte.totales.neto, false]);
  }
  if (dte.totales.exento > 0) {
    totalesRows.push(["EXENTO $", dte.totales.exento, false]);
  }
  if (dte.totales.iva > 0) {
    totalesRows.push([
      `I.V.A. ${dte.totales.tasaIva || 19}% $`,
      dte.totales.iva,
      false,
    ]);
  }
  totalesRows.push(["TOTAL $", dte.totales.total, true]);

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
    page.drawText(label, {
      x: totalesX + 8,
      y: rowYabs,
      font: isBold ? ctx.fontBold : ctx.fontRegular,
      size: 9,
    });
    const valueText = formatNumber(value);
    const valueWidth = (isBold ? ctx.fontBold : ctx.fontRegular).widthOfTextAtSize(
      valueText,
      9,
    );
    page.drawText(valueText, {
      x: totalesX + totalesW - 8 - valueWidth,
      y: rowYabs,
      font: isBold ? ctx.fontBold : ctx.fontRegular,
      size: 9,
    });
  });

  // ─────────────────────────────────────────────
  // 7. TIMBRE PDF417 + leyenda (abajo izquierda)
  // ─────────────────────────────────────────────
  const timbreH = 80;
  const timbreW = (ctx.timbreImage.width / ctx.timbreImage.height) * timbreH;
  const timbreYBase = MARGIN + 60;
  page.drawImage(ctx.timbreImage, {
    x: MARGIN,
    y: timbreYBase,
    width: Math.min(timbreW, 280),
    height: timbreH,
  });

  const fechaResolucionStr =
    options.fechaResolucion instanceof Date
      ? options.fechaResolucion.toISOString().split("T")[0]
      : String(options.fechaResolucion);
  page.drawText(
    `Resolución: ${options.numeroResolucion} del ${fechaResolucionStr}`,
    {
      x: MARGIN,
      y: timbreYBase - 12,
      font: ctx.fontRegular,
      size: 7,
    },
  );
  page.drawText("Timbre Electrónico S.I.I.", {
    x: MARGIN,
    y: timbreYBase - 22,
    font: ctx.fontRegular,
    size: 7,
  });
  page.drawText("Verifique Documento: www.sii.cl", {
    x: MARGIN,
    y: timbreYBase - 32,
    font: ctx.fontRegular,
    size: 7,
  });

  // Indicador ORIGINAL/CEDIBLE en el footer central
  const marker = ctx.isCedible ? "CEDIBLE" : "ORIGINAL";
  drawCenteredText(page, marker, {
    x: 0,
    y: MARGIN - 5,
    w: PAGE_WIDTH,
    font: ctx.fontBold,
    size: 10,
    color: COLORS.siiRed,
  });

  // ─────────────────────────────────────────────
  // 8. CEDIBLE — Acuse de Recibo + texto legal Ley 19.983
  // ─────────────────────────────────────────────
  if (ctx.isCedible) {
    // Texto legal Ley 19.983 — va ARRIBA del bloque inferior, ocupando
    // el ancho completo, para no superponerse con el PDF417 ni con el
    // cuadro Acuse de Recibo. Lo centramos arriba del bottom block.
    const legalText =
      "EL ACUSE DE RECIBO QUE SE DECLARA EN ESTE ACTO, DE ACUERDO A LO DISPUESTO " +
      "EN LA LETRA b) DEL ART. 4° Y LA LETRA c) DEL ART. 5° DE LA LEY 19.983, " +
      "ACREDITA QUE LA ENTREGA DE MERCADERÍAS O SERVICIO(S) PRESTADO(S) HA(N) SIDO " +
      "RECIBIDO(S) EN TOTAL CONFORMIDAD.";

    const legalY = MARGIN + 175;
    drawWrappedText(page, legalText, {
      x: MARGIN,
      y: legalY,
      w: PAGE_WIDTH - 2 * MARGIN,
      font: ctx.fontRegular,
      size: 7,
      lineHeight: 9,
      color: COLORS.gray,
    });

    // Cuadro Acuse de Recibo — abajo derecha, alineado con el PDF417.
    const acuseX = PAGE_WIDTH - MARGIN - 240;
    const acuseY = MARGIN + 50;
    const acuseW = 240;
    const acuseH = 110;

    page.drawRectangle({
      x: acuseX,
      y: acuseY,
      width: acuseW,
      height: acuseH,
      borderColor: COLORS.borderDark,
      borderWidth: 0.7,
    });
    drawCenteredText(page, "ACUSE DE RECIBO", {
      x: acuseX,
      y: acuseY + acuseH - 14,
      w: acuseW,
      font: ctx.fontBold,
      size: 9,
    });
    const labels = ["NOMBRE:", "RUT:", "FECHA:", "RECINTO:", "FIRMA:"];
    labels.forEach((label, i) => {
      const yy = acuseY + acuseH - 30 - i * 16;
      page.drawText(label, {
        x: acuseX + 8,
        y: yy,
        font: ctx.fontBold,
        size: 7,
      });
      page.drawLine({
        start: { x: acuseX + 60, y: yy - 1 },
        end: { x: acuseX + acuseW - 8, y: yy - 1 },
        thickness: 0.3,
        color: COLORS.gray,
      });
    });
  }
}

/**
 * Genera un PNG con el código PDF417 del TED del DTE.
 *
 * Nota tipo: los typings de bwip-js (4.10.x) NO exponen las opciones
 * específicas de PDF417 (`columns`, `eclevel`, `paddingwidth`,
 * `paddingheight`) en `RenderOptions`. La librería SÍ las acepta en
 * runtime — son válidas del BWIPP backend (postscript de barcodes).
 * El cast a `Record<string, unknown>` evita el error TS sin afectar
 * funcionalidad.
 */
async function generatePdf417(tedXml: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const png = await (bwipjs.toBuffer as any)({
    bcid: "pdf417",
    text: tedXml,
    columns: 9,
    eclevel: 5,
    scale: 2,
    paddingwidth: 4,
    paddingheight: 4,
  });
  return Buffer.from(png);
}

// ─────────────────────────────────────────────
// HELPERS de formato
// ─────────────────────────────────────────────

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("es-CL");
}

function formatRut(rut: string): string {
  if (!rut) return "";
  const cleaned = rut.replace(/\./g, "").trim().toUpperCase();
  const m = cleaned.match(/^(\d{1,8})-([0-9K])$/);
  if (!m) return rut;
  const [, num, dv] = m;
  const formatted = num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

function formatFechaLarga(fechaIso: string): string {
  const meses = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];
  const m = fechaIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return fechaIso;
  const [, y, mes, d] = m;
  return `${parseInt(d, 10)} de ${meses[parseInt(mes, 10) - 1]} de ${y}`;
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; w: number; font: PDFFont; size: number; color?: RGB },
): void {
  const width = opts.font.widthOfTextAtSize(text, opts.size);
  page.drawText(text, {
    x: opts.x + (opts.w - width) / 2,
    y: opts.y,
    font: opts.font,
    size: opts.size,
    color: opts.color ?? COLORS.black,
  });
}

/**
 * Trunca un string para que su renderización con `font` a `size` puntos
 * no exceda `maxWidth`. Si excede, recorta y agrega "…" al final.
 * Evita overflows en cuadros de ancho fijo (cuadro receptor, header,
 * tabla de detalle).
 */
function truncateToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (!text) return "";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + ellipsis;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    w: number;
    font: PDFFont;
    size: number;
    lineHeight: number;
    color?: RGB;
  },
): void {
  const words = text.split(/\s+/);
  let line = "";
  let yCursor = opts.y;
  for (const word of words) {
    const tentative = line ? `${line} ${word}` : word;
    const width = opts.font.widthOfTextAtSize(tentative, opts.size);
    if (width > opts.w && line) {
      page.drawText(line, {
        x: opts.x,
        y: yCursor,
        font: opts.font,
        size: opts.size,
        color: opts.color ?? COLORS.black,
      });
      line = word;
      yCursor -= opts.lineHeight;
    } else {
      line = tentative;
    }
  }
  if (line) {
    page.drawText(line, {
      x: opts.x,
      y: yCursor,
      font: opts.font,
      size: opts.size,
      color: opts.color ?? COLORS.black,
    });
  }
}
