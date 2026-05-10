/**
 * Render del documento de cobro (Proforma / Estado de Pago) usando
 * @react-pdf/renderer.
 *
 * IMPORTANT: archivo .ts plano (sin JSX). Usa eval('require') para React
 * y dynamic import() para @react-pdf/renderer (ESM-only). Mismo patrón
 * que render-quotation.ts — leer ese archivo para el contexto completo.
 *
 * Soporta 2 variantes:
 *   - PROFORMA       → layout factura SII con marca de agua "PROFORMA".
 *   - ESTADO_DE_PAGO → layout landscape estilo Gard (columnas operativas,
 *                       N° Orden, contacto, código verif, firmantes).
 *
 * DTE_PREVIEW NO se renderiza acá — es un wrapper sobre
 * `renderDtePreviewPdf` (pdf-lib) y se gestiona en el endpoint.
 */

import type { BillingDocProps, BillingDocLine, BillingDocSignerProp } from "./build-billing-doc-props";

function fmtCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(n || 0);
}

function fmtUF(n: number): string {
  return `${new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)} UF`;
}

function fmtAmount(n: number, currency: "CLP" | "UF"): string {
  return currency === "UF" ? fmtUF(n) : fmtCLP(n);
}

function fmtNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n || 0);
}

export async function renderBillingDocPdf(
  props: BillingDocProps,
): Promise<Buffer> {
  if (props.variant === "DTE_PREVIEW") {
    throw new Error(
      "renderBillingDocPdf no soporta DTE_PREVIEW; usar renderDtePreviewPdf directamente",
    );
  }

  // eslint-disable-next-line no-eval
  const nodeRequire = eval("require") as NodeRequire;
  const React = nodeRequire("react");
  const pdf = await import("@react-pdf/renderer");

  const {
    renderToBuffer,
    Document,
    Page,
    View,
    Text,
    StyleSheet,
    Image: PDFImage,
  } = pdf;

  // Font registration (idempotente, mismo pattern que QuotationPDF).
  const path = nodeRequire("path");
  const { Font } = pdf;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const registered = (globalThis as Record<string, unknown>).__pdfFontsRegistered;
  if (!registered) {
    Font.register({
      family: "PlusJakartaSans",
      fonts: [
        { src: path.join(fontsDir, "PlusJakartaSans-Regular.ttf"), fontWeight: 400 },
        { src: path.join(fontsDir, "PlusJakartaSans-Medium.ttf"), fontWeight: 500 },
        { src: path.join(fontsDir, "PlusJakartaSans-SemiBold.ttf"), fontWeight: 600 },
        { src: path.join(fontsDir, "PlusJakartaSans-Bold.ttf"), fontWeight: 700 },
        { src: path.join(fontsDir, "PlusJakartaSans-ExtraBold.ttf"), fontWeight: 800 },
      ],
    });
    Font.register({
      family: "JetBrainsMono",
      fonts: [
        { src: path.join(fontsDir, "JetBrainsMono-Regular.ttf"), fontWeight: 400 },
        { src: path.join(fontsDir, "JetBrainsMono-Medium.ttf"), fontWeight: 500 },
      ],
    });
    (globalThis as Record<string, unknown>).__pdfFontsRegistered = true;
  }

  const e = React.createElement;

  /* ─── Theme (colores resueltos desde tenant config + branding) ─── */
  const C = {
    brand: props.branding.primary || "#0D1117",
    accent: props.branding.secondary || "#0066FF",
    ink: "#0F172A",
    body: "#1E293B",
    muted: "#475569",
    subtle: "#94A3B8",
    line: "#CBD5E1",
    rule: "#E2E8F0",
    bg: "#FFFFFF",
    bgAlt: "#F8FAFC",
    bgZebra: "#F1F5F9",
    warning: "#B45309",
  };
  const F = { sans: "PlusJakartaSans", mono: "JetBrainsMono" };

  /* ─── Estilos comunes ─── */
  const sCommon = StyleSheet.create({
    page: {
      fontFamily: F.sans,
      fontSize: 9,
      color: C.body,
      backgroundColor: C.bg,
    },
    pageBoxed: {
      paddingHorizontal: 32,
      paddingVertical: 28,
    },
    pageBoxedLandscape: {
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    sectionTitle: {
      fontSize: 8,
      fontWeight: 700,
      color: C.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    label: {
      fontSize: 7,
      color: C.subtle,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 1,
    },
    value: { fontSize: 9, color: C.ink, fontWeight: 500 },
    monoValue: { fontFamily: F.mono, fontSize: 9, color: C.ink },
    rowEnd: { flexDirection: "row", justifyContent: "flex-end" },
    rowBetween: { flexDirection: "row", justifyContent: "space-between" },
    line: { height: 1, backgroundColor: C.rule, marginVertical: 8 },
  });

  /* ─── PROFORMA ─── */
  if (props.variant === "PROFORMA") {
    const sProforma = StyleSheet.create({
      headerBand: {
        backgroundColor: C.brand,
        paddingHorizontal: 28,
        paddingVertical: 16,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
      headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
      logo: { height: 40, width: 100, objectFit: "contain" },
      brandName: {
        fontFamily: F.sans,
        fontWeight: 800,
        fontSize: 18,
        color: "#FFFFFF",
        letterSpacing: 1.5,
      },
      headerRight: {
        alignItems: "flex-end",
        borderLeft: `1 solid ${C.accent}`,
        paddingLeft: 16,
      },
      docKind: {
        fontFamily: F.sans,
        fontWeight: 800,
        fontSize: 22,
        color: "#FFFFFF",
        letterSpacing: 3,
      },
      proformaTag: {
        fontSize: 7,
        color: C.accent,
        letterSpacing: 1,
        marginTop: 4,
      },
      proformaSubtle: {
        fontSize: 6.5,
        color: "#FFFFFF",
        opacity: 0.7,
        marginTop: 1,
      },
      accentBar: { height: 3, backgroundColor: C.accent },

      watermark: {
        position: "absolute",
        top: 320,
        left: 80,
        right: 80,
        opacity: 0.08,
        textAlign: "center",
        fontSize: 64,
        fontWeight: 800,
        color: C.warning,
        letterSpacing: 6,
        transform: "rotate(-25deg)",
      },

      issuerStrip: {
        flexDirection: "row",
        backgroundColor: C.bgAlt,
        borderBottom: `1 solid ${C.rule}`,
        paddingHorizontal: 28,
        paddingVertical: 10,
      },
      issuerCell: {
        flex: 1,
        paddingRight: 12,
        borderRight: `1 solid ${C.rule}`,
      },
      issuerCellLast: { flex: 1, paddingLeft: 12 },

      body: { paddingHorizontal: 28, paddingVertical: 18 },
      receptorBox: {
        border: `1 solid ${C.rule}`,
        borderRadius: 4,
        padding: 12,
        marginBottom: 16,
      },
      receptorRow: {
        flexDirection: "row",
        gap: 12,
        marginTop: 4,
      },
      receptorCell: { flex: 1 },

      table: { marginBottom: 12 },
      thead: {
        flexDirection: "row",
        backgroundColor: C.brand,
        paddingVertical: 6,
        paddingHorizontal: 6,
      },
      th: {
        fontSize: 7,
        color: "#FFFFFF",
        fontWeight: 700,
        textTransform: "uppercase",
      },
      tr: {
        flexDirection: "row",
        borderBottom: `1 solid ${C.rule}`,
        paddingVertical: 6,
        paddingHorizontal: 6,
      },
      trZebra: {
        flexDirection: "row",
        backgroundColor: C.bgZebra,
        borderBottom: `1 solid ${C.rule}`,
        paddingVertical: 6,
        paddingHorizontal: 6,
      },
      td: { fontSize: 8, color: C.body },
      tdRight: { fontSize: 8, color: C.body, textAlign: "right" },

      colCode: { width: 60 },
      colDesc: { flex: 1 },
      colQty: { width: 40, textAlign: "right" },
      colUnit: { width: 36 },
      colPrice: { width: 70, textAlign: "right" },
      colDisc: { width: 40, textAlign: "right" },
      colNet: { width: 80, textAlign: "right" },

      totalsBox: {
        marginTop: 8,
        marginLeft: "auto",
        width: 220,
        border: `1 solid ${C.rule}`,
      },
      totalsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderBottom: `1 solid ${C.rule}`,
      },
      totalsRowLast: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: C.brand,
      },
      totalLabel: { fontSize: 8, color: C.muted },
      totalValue: { fontSize: 9, color: C.ink, fontWeight: 600 },
      totalLabelLast: { fontSize: 9, color: "#FFFFFF", fontWeight: 700 },
      totalValueLast: { fontSize: 11, color: "#FFFFFF", fontWeight: 800 },

      notes: {
        marginTop: 16,
        fontSize: 8,
        color: C.muted,
        fontStyle: "italic",
      },
      footerLegal: {
        position: "absolute",
        bottom: 28,
        left: 28,
        right: 28,
        fontSize: 7,
        color: C.subtle,
        textAlign: "center",
        borderTop: `1 solid ${C.rule}`,
        paddingTop: 8,
      },
    });

    const buildLineRows = () =>
      props.lines.map((l: BillingDocLine, i: number) =>
        e(
          View,
          { key: l.lineNumber, style: i % 2 === 0 ? sProforma.tr : sProforma.trZebra },
          e(Text, { style: [sProforma.td, sProforma.colCode] }, l.itemCode ?? ""),
          e(
            View,
            { style: sProforma.colDesc },
            e(Text, { style: { fontSize: 8, color: C.ink, fontWeight: 500 } }, l.itemName),
            l.description
              ? e(
                  Text,
                  { style: { fontSize: 7, color: C.muted, marginTop: 1 } },
                  l.description,
                )
              : null,
          ),
          e(Text, { style: [sProforma.td, sProforma.colQty] }, fmtNumber(l.quantity, 2)),
          e(Text, { style: [sProforma.td, sProforma.colUnit] }, l.unit ?? ""),
          e(
            Text,
            { style: [sProforma.td, sProforma.colPrice] },
            l.unitPriceUf
              ? `${fmtNumber(l.unitPriceUf, 2)} UF`
              : fmtCLP(l.unitPrice),
          ),
          e(
            Text,
            { style: [sProforma.td, sProforma.colDisc] },
            l.discountPct ? `${fmtNumber(l.discountPct, 2)}%` : "—",
          ),
          e(
            Text,
            { style: [sProforma.td, sProforma.colNet] },
            fmtAmount(l.netAmount, props.totals.currency),
          ),
        ),
      );

    const proformaDoc = e(
      Document,
      null,
      e(
        Page,
        { size: "A4", style: [sCommon.page] },

        // Header band
        e(
          View,
          { style: sProforma.headerBand },
          e(
            View,
            { style: sProforma.headerLeft },
            props.emisor.logoDataUrl
              ? e(PDFImage, { src: props.emisor.logoDataUrl, style: sProforma.logo })
              : e(Text, { style: sProforma.brandName }, props.emisor.brandNameUpper),
          ),
          e(
            View,
            { style: sProforma.headerRight },
            e(Text, { style: sProforma.docKind }, "PROFORMA"),
            e(Text, { style: sProforma.proformaTag }, "NO ES FACTURA TRIBUTARIA"),
            e(
              Text,
              { style: sProforma.proformaSubtle },
              `Se facturará como ${props.document.dteTypeName} al SII tras aprobación`,
            ),
            e(Text, { style: { fontSize: 8, color: "#FFFFFF", marginTop: 6 } }, `Fecha: ${props.document.dateFormatted}`),
            props.document.numeroOrdenContrato
              ? e(
                  Text,
                  { style: { fontSize: 8, color: "#FFFFFF", marginTop: 2 } },
                  `N° Orden: ${props.document.numeroOrdenContrato}`,
                )
              : null,
          ),
        ),
        e(View, { style: sProforma.accentBar }),

        // Watermark
        e(Text, { style: sProforma.watermark }, "PROFORMA"),

        // Emisor strip
        e(
          View,
          { style: sProforma.issuerStrip },
          e(
            View,
            { style: sProforma.issuerCell },
            e(Text, { style: sCommon.label }, "Emisor"),
            e(Text, { style: sCommon.value }, props.emisor.razonSocial),
            e(Text, { style: { fontSize: 8, color: C.muted } }, `RUT: ${props.emisor.rut}`),
            props.emisor.giro
              ? e(Text, { style: { fontSize: 8, color: C.muted } }, props.emisor.giro)
              : null,
          ),
          e(
            View,
            { style: sProforma.issuerCellLast },
            e(Text, { style: sCommon.label }, "Dirección"),
            e(
              Text,
              { style: { fontSize: 8, color: C.body } },
              [props.emisor.direccion, props.emisor.comuna, props.emisor.ciudad]
                .filter(Boolean)
                .join(", "),
            ),
            props.emisor.telefono
              ? e(Text, { style: { fontSize: 8, color: C.muted } }, `Tel: ${props.emisor.telefono}`)
              : null,
            props.emisor.email
              ? e(Text, { style: { fontSize: 8, color: C.muted } }, props.emisor.email)
              : null,
          ),
        ),

        // Body
        e(
          View,
          { style: sProforma.body },
          // Receptor
          e(
            View,
            { style: sProforma.receptorBox },
            e(Text, { style: sCommon.sectionTitle }, "Receptor"),
            e(
              View,
              { style: sProforma.receptorRow },
              e(
                View,
                { style: sProforma.receptorCell },
                e(Text, { style: sCommon.label }, "Razón social"),
                e(Text, { style: sCommon.value }, props.receptor.razonSocial),
                e(Text, { style: { fontSize: 8, color: C.muted, marginTop: 2 } }, `RUT: ${props.receptor.rut}`),
              ),
              e(
                View,
                { style: sProforma.receptorCell },
                e(Text, { style: sCommon.label }, "Dirección"),
                e(
                  Text,
                  { style: { fontSize: 8, color: C.body } },
                  [props.receptor.direccion, props.receptor.comuna, props.receptor.ciudad]
                    .filter(Boolean)
                    .join(", ") || "—",
                ),
                props.receptor.giro
                  ? e(Text, { style: { fontSize: 8, color: C.muted } }, props.receptor.giro)
                  : null,
              ),
            ),
          ),

          // Tabla líneas
          e(
            View,
            { style: sProforma.table },
            e(
              View,
              { style: sProforma.thead },
              e(Text, { style: [sProforma.th, sProforma.colCode] }, "Código"),
              e(Text, { style: [sProforma.th, sProforma.colDesc] }, "Descripción"),
              e(Text, { style: [sProforma.th, sProforma.colQty] }, "Cant."),
              e(Text, { style: [sProforma.th, sProforma.colUnit] }, "Un."),
              e(Text, { style: [sProforma.th, sProforma.colPrice] }, "P. Unit."),
              e(Text, { style: [sProforma.th, sProforma.colDisc] }, "Desc."),
              e(Text, { style: [sProforma.th, sProforma.colNet] }, "Subtotal"),
            ),
            ...buildLineRows(),
          ),

          // Totales
          e(
            View,
            { style: sProforma.totalsBox },
            e(
              View,
              { style: sProforma.totalsRow },
              e(Text, { style: sProforma.totalLabel }, "Neto"),
              e(Text, { style: sProforma.totalValue }, fmtAmount(props.totals.netAmount, props.totals.currency)),
            ),
            props.totals.exemptAmount > 0
              ? e(
                  View,
                  { style: sProforma.totalsRow },
                  e(Text, { style: sProforma.totalLabel }, "Exento"),
                  e(Text, { style: sProforma.totalValue }, fmtAmount(props.totals.exemptAmount, props.totals.currency)),
                )
              : null,
            e(
              View,
              { style: sProforma.totalsRow },
              e(Text, { style: sProforma.totalLabel }, `IVA ${fmtNumber(props.totals.taxRate, 0)}%`),
              e(Text, { style: sProforma.totalValue }, fmtAmount(props.totals.taxAmount, props.totals.currency)),
            ),
            e(
              View,
              { style: sProforma.totalsRowLast },
              e(Text, { style: sProforma.totalLabelLast }, "TOTAL"),
              e(Text, { style: sProforma.totalValueLast }, fmtAmount(props.totals.totalAmount, props.totals.currency)),
            ),
          ),

          props.notes
            ? e(Text, { style: sProforma.notes }, `Notas: ${props.notes}`)
            : null,
        ),

        e(
          Text,
          { style: sProforma.footerLegal, fixed: true },
          "Esta proforma no constituye documento tributario electrónico. Solo tiene valor referencial. La factura electrónica al SII se emitirá una vez aprobada por el cliente.",
        ),
      ),
    );

    return await renderToBuffer(proformaDoc);
  }

  /* ─── ESTADO_DE_PAGO (landscape) ─── */
  const sEP = StyleSheet.create({
    pageEP: {
      paddingHorizontal: 28,
      paddingVertical: 24,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    topLeft: { flex: 1, paddingRight: 24 },
    topRight: { width: 280, alignItems: "flex-end" },
    logoEP: { height: 56, width: 180, objectFit: "contain", marginBottom: 8 },
    issuerName: { fontSize: 13, fontWeight: 700, color: C.brand },
    issuerLine: { fontSize: 8, color: C.body, marginTop: 1 },
    metaRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 4,
    },
    metaLabel: {
      fontSize: 7,
      color: C.muted,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      width: 130,
      textAlign: "right",
    },
    metaValue: {
      fontSize: 9,
      color: C.ink,
      fontWeight: 600,
      textAlign: "right",
    },
    docTitle: {
      fontSize: 13,
      color: C.brand,
      fontWeight: 800,
      textAlign: "center",
      marginVertical: 8,
      letterSpacing: 0.5,
    },
    docSubtitle: {
      fontSize: 9,
      color: C.muted,
      textAlign: "center",
      marginBottom: 12,
    },
    clientBox: {
      flexDirection: "row",
      gap: 16,
      borderTop: `1 solid ${C.rule}`,
      borderBottom: `1 solid ${C.rule}`,
      paddingVertical: 8,
      marginBottom: 12,
    },
    clientCell: { flex: 1, gap: 2 },
    table: { marginBottom: 12 },
    thead: {
      flexDirection: "row",
      backgroundColor: C.brand,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    th: {
      fontSize: 6.5,
      color: "#FFFFFF",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: 0.3,
      paddingHorizontal: 2,
    },
    tr: {
      flexDirection: "row",
      borderBottom: `1 solid ${C.rule}`,
      paddingVertical: 5,
      paddingHorizontal: 4,
    },
    trZebra: {
      flexDirection: "row",
      backgroundColor: C.bgZebra,
      borderBottom: `1 solid ${C.rule}`,
      paddingVertical: 5,
      paddingHorizontal: 4,
    },
    td: { fontSize: 7, color: C.body, paddingHorizontal: 2 },
    tdRight: { fontSize: 7, color: C.body, textAlign: "right", paddingHorizontal: 2 },

    // Columnas Estado de Pago (Gard)
    cCodigo: { width: 50 },
    cDesc: { flex: 1.2 },
    cInst: { flex: 1 },
    cActividad: { flex: 1 },
    cOrdMensual: { width: 60 },
    cOrdTrabajo: { width: 60 },
    cFEntrega: { width: 50 },
    cValBase: { width: 60, textAlign: "right" },
    cDias: { width: 32, textAlign: "right" },
    cFactor: { width: 36, textAlign: "right" },
    cQty: { width: 36, textAlign: "right" },
    cUn: { width: 28 },
    cValNeto: { width: 64, textAlign: "right" },
    cFEjec: { width: 50 },
    cFRep: { width: 50 },
    cFInf: { width: 50 },

    totalsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingVertical: 3,
      paddingRight: 8,
    },
    totalsLabel: { fontSize: 8, color: C.muted, marginRight: 16 },
    totalsValue: { fontSize: 9, color: C.ink, fontWeight: 600, width: 100, textAlign: "right" },
    totalsLabelBig: { fontSize: 9, color: C.brand, fontWeight: 700, marginRight: 16 },
    totalsValueBig: { fontSize: 11, color: C.brand, fontWeight: 800, width: 100, textAlign: "right" },

    signersBlock: {
      flexDirection: "row",
      gap: 24,
      marginTop: 28,
    },
    signerCell: {
      flex: 1,
      alignItems: "center",
    },
    signerImg: { height: 36, width: 110, objectFit: "contain", marginBottom: 4 },
    signerLine: {
      borderTop: `1 solid ${C.ink}`,
      width: "100%",
      paddingTop: 4,
      alignItems: "center",
    },
    signerName: { fontSize: 9, color: C.ink, fontWeight: 600 },
    signerRole: { fontSize: 7, color: C.muted },

    footer: {
      position: "absolute",
      bottom: 16,
      left: 28,
      right: 28,
      borderTop: `1 solid ${C.rule}`,
      paddingTop: 6,
      fontSize: 6.5,
      color: C.subtle,
      textAlign: "center",
    },
  });

  const buildEpRows = () =>
    props.lines.map((l: BillingDocLine, i: number) => {
      const meta = l.estadoPagoMeta ?? {};
      return e(
        View,
        { key: l.lineNumber, style: i % 2 === 0 ? sEP.tr : sEP.trZebra },
        e(Text, { style: [sEP.td, sEP.cCodigo] }, l.itemCode ?? ""),
        e(Text, { style: [sEP.td, sEP.cDesc] }, l.description ?? l.itemName),
        e(Text, { style: [sEP.td, sEP.cInst] }, props.document.installationName ?? ""),
        e(Text, { style: [sEP.td, sEP.cActividad] }, l.itemName),
        e(Text, { style: [sEP.td, sEP.cOrdMensual] }, ""),
        e(Text, { style: [sEP.td, sEP.cOrdTrabajo] }, ""),
        e(Text, { style: [sEP.td, sEP.cFEntrega] }, props.document.dateFormatted),
        e(
          Text,
          { style: [sEP.td, sEP.cValBase] },
          l.unitPriceUf
            ? `${fmtNumber(l.unitPriceUf, 2)} UF`
            : fmtCLP(l.unitPrice),
        ),
        e(Text, { style: [sEP.td, sEP.cDias] }, meta.dias != null ? String(meta.dias) : ""),
        e(Text, { style: [sEP.td, sEP.cFactor] }, meta.factorZona != null ? fmtNumber(meta.factorZona, 2) : ""),
        e(Text, { style: [sEP.td, sEP.cQty] }, fmtNumber(l.quantity, 2)),
        e(Text, { style: [sEP.td, sEP.cUn] }, l.unit ?? ""),
        e(Text, { style: [sEP.td, sEP.cValNeto] }, fmtAmount(l.netAmount, props.totals.currency)),
        e(Text, { style: [sEP.td, sEP.cFEjec] }, meta.fechaEjecucion ?? props.document.dateFormatted),
        e(Text, { style: [sEP.td, sEP.cFRep] }, meta.fechaReporteTrabajo ?? ""),
        e(Text, { style: [sEP.td, sEP.cFInf] }, meta.fechaInformeTecnico ?? ""),
      );
    });

  const buildSigners = () => {
    const tenantSigners = props.signers.tenant;
    const clientSigners = props.signers.client;
    if (tenantSigners.length === 0 && clientSigners.length === 0) return null;

    const renderSignerCell = (s: BillingDocSignerProp) =>
      e(
        View,
        { key: s.id, style: sEP.signerCell },
        s.signatureDataUrl
          ? e(PDFImage, { src: s.signatureDataUrl, style: sEP.signerImg })
          : e(View, { style: { height: 36 } }),
        e(
          View,
          { style: sEP.signerLine },
          e(Text, { style: sEP.signerName }, s.name),
          e(Text, { style: sEP.signerRole }, s.role),
        ),
      );

    // Si hay firmantes en ambos lados, dos filas separadas con label arriba.
    // Si solo un lado, una sola fila sin labels.
    if (tenantSigners.length > 0 && clientSigners.length > 0) {
      return e(
        View,
        { style: { marginTop: 24 } },
        e(
          View,
          { style: { marginBottom: 12 } },
          e(
            Text,
            { style: { fontSize: 7, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 } },
            "Por la empresa",
          ),
          e(
            View,
            { style: { flexDirection: "row", gap: 24 } },
            ...tenantSigners.map(renderSignerCell),
          ),
        ),
        e(
          View,
          {},
          e(
            Text,
            { style: { fontSize: 7, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 } },
            "Por el cliente · Recibido conforme",
          ),
          e(
            View,
            { style: { flexDirection: "row", gap: 24 } },
            ...clientSigners.map(renderSignerCell),
          ),
        ),
      );
    }

    const onlyOneSide = tenantSigners.length > 0 ? tenantSigners : clientSigners;
    return e(
      View,
      { style: sEP.signersBlock },
      ...onlyOneSide.map(renderSignerCell),
    );
  };

  const epDoc = e(
    Document,
    null,
    e(
      Page,
      { size: "A4", orientation: "landscape", style: [sCommon.page, sEP.pageEP] },

      // Top row: emisor (left) + meta (right)
      e(
        View,
        { style: sEP.topRow },
        e(
          View,
          { style: sEP.topLeft },
          props.emisor.logoDataUrl
            ? e(PDFImage, { src: props.emisor.logoDataUrl, style: sEP.logoEP })
            : e(Text, { style: { fontSize: 18, fontWeight: 800, color: C.brand } }, props.emisor.brandNameUpper),
          e(Text, { style: sEP.issuerName }, props.emisor.razonSocial),
          e(Text, { style: sEP.issuerLine }, `RUT: ${props.emisor.rut}`),
          props.emisor.direccion
            ? e(
                Text,
                { style: sEP.issuerLine },
                [props.emisor.direccion, props.emisor.comuna].filter(Boolean).join(", "),
              )
            : null,
          props.emisor.ciudad ? e(Text, { style: sEP.issuerLine }, props.emisor.ciudad) : null,
          props.emisor.telefono ? e(Text, { style: sEP.issuerLine }, `Fono: ${props.emisor.telefono}`) : null,
        ),
        e(
          View,
          { style: sEP.topRight },
          props.document.numeroOrdenContrato
            ? e(
                View,
                { style: sEP.metaRow },
                e(Text, { style: sEP.metaLabel }, "N° Orden / Contrato:"),
                e(Text, { style: sEP.metaValue }, props.document.numeroOrdenContrato),
              )
            : null,
          e(
            View,
            { style: sEP.metaRow },
            e(Text, { style: sEP.metaLabel }, "Fecha emisión:"),
            e(Text, { style: sEP.metaValue }, props.document.dateFormatted),
          ),
          props.receptor.contactName
            ? e(
                View,
                { style: sEP.metaRow },
                e(Text, { style: sEP.metaLabel }, "Contacto:"),
                e(Text, { style: sEP.metaValue }, props.receptor.contactName),
              )
            : null,
          e(
            View,
            { style: sEP.metaRow },
            e(Text, { style: sEP.metaLabel }, "Código verificación:"),
            e(Text, { style: [sEP.metaValue, { fontFamily: F.mono }] }, props.document.verificationCode),
          ),
        ),
      ),

      // Title
      e(
        Text,
        { style: sEP.docTitle },
        `Estado de pago — ${props.receptor.razonSocial}`,
      ),
      e(
        Text,
        { style: sEP.docSubtitle },
        `${props.document.installationName ? `${props.document.installationName} · ` : ""}${props.document.periodoLabel}`,
      ),

      // Client box
      e(
        View,
        { style: sEP.clientBox },
        e(
          View,
          { style: sEP.clientCell },
          e(Text, { style: sCommon.label }, "Cliente"),
          e(Text, { style: sCommon.value }, props.receptor.razonSocial),
        ),
        e(
          View,
          { style: sEP.clientCell },
          e(Text, { style: sCommon.label }, "RUT"),
          e(Text, { style: [sCommon.monoValue] }, props.receptor.rut),
        ),
        e(
          View,
          { style: sEP.clientCell },
          e(Text, { style: sCommon.label }, "Dirección"),
          e(
            Text,
            { style: { fontSize: 8, color: C.body } },
            [props.receptor.direccion, props.receptor.comuna, props.receptor.ciudad]
              .filter(Boolean)
              .join(", ") || "—",
          ),
        ),
        e(
          View,
          { style: sEP.clientCell },
          e(Text, { style: sCommon.label }, "Contacto"),
          e(
            Text,
            { style: { fontSize: 8, color: C.body } },
            [props.receptor.contactName, props.receptor.contactPhone, props.receptor.contactEmail]
              .filter(Boolean)
              .join(" · ") || "—",
          ),
        ),
      ),

      // Tabla landscape
      e(
        View,
        { style: sEP.table },
        e(
          View,
          { style: sEP.thead },
          e(Text, { style: [sEP.th, sEP.cCodigo] }, "Código"),
          e(Text, { style: [sEP.th, sEP.cDesc] }, "Descripción"),
          e(Text, { style: [sEP.th, sEP.cInst] }, "Instalación"),
          e(Text, { style: [sEP.th, sEP.cActividad] }, "Actividad"),
          e(Text, { style: [sEP.th, sEP.cOrdMensual] }, "Orden mensual"),
          e(Text, { style: [sEP.th, sEP.cOrdTrabajo] }, "Orden trabajo"),
          e(Text, { style: [sEP.th, sEP.cFEntrega] }, "Fecha entrega"),
          e(Text, { style: [sEP.th, sEP.cValBase] }, "Valor base"),
          e(Text, { style: [sEP.th, sEP.cDias] }, "Días"),
          e(Text, { style: [sEP.th, sEP.cFactor] }, "F. Zona"),
          e(Text, { style: [sEP.th, sEP.cQty] }, "Cant."),
          e(Text, { style: [sEP.th, sEP.cUn] }, "Un."),
          e(Text, { style: [sEP.th, sEP.cValNeto] }, "Valor neto"),
          e(Text, { style: [sEP.th, sEP.cFEjec] }, "F. Ejec."),
          e(Text, { style: [sEP.th, sEP.cFRep] }, "F. Rep."),
          e(Text, { style: [sEP.th, sEP.cFInf] }, "F. Informe"),
        ),
        ...buildEpRows(),
      ),

      // Totales
      e(
        View,
        { style: sEP.totalsRow },
        e(Text, { style: sEP.totalsLabel }, "Valor neto"),
        e(Text, { style: sEP.totalsValue }, fmtAmount(props.totals.netAmount, props.totals.currency)),
      ),
      props.totals.exemptAmount > 0
        ? e(
            View,
            { style: sEP.totalsRow },
            e(Text, { style: sEP.totalsLabel }, "Exento"),
            e(Text, { style: sEP.totalsValue }, fmtAmount(props.totals.exemptAmount, props.totals.currency)),
          )
        : null,
      e(
        View,
        { style: sEP.totalsRow },
        e(Text, { style: sEP.totalsLabel }, `IVA ${fmtNumber(props.totals.taxRate, 0)}%`),
        e(Text, { style: sEP.totalsValue }, fmtAmount(props.totals.taxAmount, props.totals.currency)),
      ),
      e(
        View,
        { style: sEP.totalsRow },
        e(Text, { style: sEP.totalsLabelBig }, "TOTAL"),
        e(Text, { style: sEP.totalsValueBig }, fmtAmount(props.totals.totalAmount, props.totals.currency)),
      ),

      // Firmas
      buildSigners(),

      // Footer legal
      props.branding.estadoPagoFooterLegal
        ? e(Text, { style: sEP.footer, fixed: true }, props.branding.estadoPagoFooterLegal)
        : e(
            Text,
            { style: sEP.footer, fixed: true },
            "Documento administrativo interno — no constituye documento tributario electrónico.",
          ),
    ),
  );

  return await renderToBuffer(epDoc);
}
