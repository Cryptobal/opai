import QRCode from "qrcode";
import { jsPDF } from "jspdf";

export type SenaleticaInput = {
  publicUrl: string;
  tenantName: string;
  tenantMonogram: string;
  installationName: string;
  address: string | null;
  installationCode: string | null;
};

async function qrPng(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 640,
    color: { dark: "#121714", light: "#ffffff" },
  });
}

function drawFinderCorners(
  pdf: jsPDF,
  x: number,
  y: number,
  size: number,
  color: [number, number, number],
) {
  const len = 10;
  const w = 1.4;
  pdf.setDrawColor(...color);
  pdf.setLineWidth(w);
  pdf.line(x, y, x + len, y);
  pdf.line(x, y, x, y + len);
  pdf.line(x + size, y, x + size - len, y);
  pdf.line(x + size, y, x + size, y + len);
  pdf.line(x, y + size, x + len, y + size);
  pdf.line(x, y + size, x, y + size - len);
  pdf.line(x + size, y + size, x + size - len, y + size);
  pdf.line(x + size, y + size, x + size, y + size - len);
}

export async function buildAficheA4Pdf(input: SenaleticaInput): Promise<Buffer> {
  const qr = await qrPng(input.publicUrl);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const brand: [number, number, number] = [23, 94, 63];

  pdf.setFillColor(244, 246, 243);
  pdf.rect(0, 0, W, 297, "F");

  pdf.setFillColor(...brand);
  pdf.rect(0, 0, W, 18, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Canal oficial de reportes", W / 2, 12, { align: "center" });

  pdf.setTextColor(23, 94, 63);
  pdf.setFontSize(10);
  pdf.text(input.tenantName.toUpperCase(), W / 2, 28, { align: "center" });

  pdf.setTextColor(18, 23, 20);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("¿Viste algo fuera de lugar?", W / 2, 42, { align: "center" });

  const qrSize = 92;
  const qrX = (W - qrSize) / 2;
  const qrY = 50;
  pdf.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
  drawFinderCorners(pdf, qrX - 3, qrY - 3, qrSize + 6, brand);

  pdf.setFillColor(255, 255, 255);
  pdf.circle(W / 2, qrY + qrSize / 2, 11, "F");
  pdf.setTextColor(...brand);
  pdf.setFontSize(10);
  pdf.text(input.tenantMonogram.slice(0, 2), W / 2, qrY + qrSize / 2 + 3, { align: "center" });

  pdf.setTextColor(91, 103, 95);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(input.publicUrl, W / 2, qrY + qrSize + 10, { align: "center" });

  const steps = [
    "1. Escanea este QR",
    "2. Confirma tu ubicación",
    "3. Describe lo que viste",
  ];
  pdf.setTextColor(18, 23, 20);
  pdf.setFontSize(11);
  steps.forEach((s, i) => pdf.text(s, W / 2, 168 + i * 8, { align: "center" }));

  pdf.setTextColor(...brand);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Anónimo · Sin app · Sin registro", W / 2, 200, { align: "center" });

  pdf.setFillColor(233, 242, 236);
  pdf.roundedRect(18, 214, 174, 32, 4, 4, "F");
  pdf.setTextColor(18, 23, 20);
  pdf.setFontSize(12);
  pdf.text(input.installationName, W / 2, 226, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(91, 103, 95);
  const band = [input.address, input.installationCode].filter(Boolean).join(" · ");
  if (band) pdf.text(band, W / 2, 234, { align: "center" });

  pdf.setFontSize(8);
  pdf.text(`Operado por ${input.tenantName} · Tecnología OPAI`, W / 2, 286, { align: "center" });

  return Buffer.from(pdf.output("arraybuffer"));
}

export async function buildStickerPdf(input: SenaleticaInput): Promise<Buffer> {
  const qr = await qrPng(input.publicUrl);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [100, 100] });
  const brand: [number, number, number] = [23, 94, 63];
  pdf.setFillColor(244, 246, 243);
  pdf.rect(0, 0, 100, 100, "F");
  pdf.setTextColor(...brand);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("Canal oficial de reportes", 50, 8, { align: "center" });
  pdf.setTextColor(18, 23, 20);
  pdf.setFontSize(9);
  pdf.text("¿Viste algo fuera de lugar?", 50, 14, { align: "center" });
  const qrSize = 62;
  const qrX = (100 - qrSize) / 2;
  pdf.addImage(qr, "PNG", qrX, 17, qrSize, qrSize);
  drawFinderCorners(pdf, qrX - 2, 15, qrSize + 4, brand);
  pdf.setFillColor(255, 255, 255);
  pdf.circle(50, 17 + qrSize / 2, 7, "F");
  pdf.setTextColor(...brand);
  pdf.setFontSize(7);
  pdf.text(input.tenantMonogram.slice(0, 2), 50, 17 + qrSize / 2 + 2, { align: "center" });
  pdf.setFontSize(6);
  pdf.setTextColor(91, 103, 95);
  pdf.text("Anónimo · Sin app · Sin registro", 50, 86, { align: "center" });
  pdf.setTextColor(18, 23, 20);
  pdf.setFontSize(7);
  pdf.text(input.installationName.slice(0, 42), 50, 93, { align: "center" });
  pdf.setFontSize(5);
  pdf.text(`Operado por ${input.tenantName} · OPAI`, 50, 98, { align: "center" });
  return Buffer.from(pdf.output("arraybuffer"));
}

export type StockStickerItem = {
  publicUrl: string;
  serialLabel: string;
};

/** Hoja A4 con adhesivos 10×10 (2×2 por página), sin nombre de instalación. */
export async function buildStockStickersPdf(opts: {
  tenantName: string;
  tenantMonogram: string;
  loteCode: string;
  items: StockStickerItem[];
}): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const brand: [number, number, number] = [23, 94, 63];
  const pageW = 210;
  const pageH = 297;
  const sticker = 100;
  const cols = 2;
  const rows = 2;
  const perPage = cols * rows;
  const gapX = (pageW - cols * sticker) / (cols + 1);
  const gapY = (pageH - rows * sticker) / (rows + 1);

  if (opts.items.length === 0) {
    pdf.setFontSize(12);
    pdf.text("Lote vacío", pageW / 2, 40, { align: "center" });
    return Buffer.from(pdf.output("arraybuffer"));
  }

  for (let i = 0; i < opts.items.length; i++) {
    if (i > 0 && i % perPage === 0) pdf.addPage();
    const slot = i % perPage;
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = gapX + col * (sticker + gapX);
    const y = gapY + row * (sticker + gapY);
    const item = opts.items[i];
    const qr = await qrPng(item.publicUrl);

    pdf.setFillColor(244, 246, 243);
    pdf.roundedRect(x, y, sticker, sticker, 3, 3, "F");
    pdf.setDrawColor(...brand);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(x, y, sticker, sticker, 3, 3, "S");

    pdf.setTextColor(...brand);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6);
    pdf.text("Canal oficial de reportes", x + sticker / 2, y + 7, { align: "center" });
    pdf.setTextColor(18, 23, 20);
    pdf.setFontSize(8);
    pdf.text("¿Viste algo fuera de lugar?", x + sticker / 2, y + 13, { align: "center" });

    const qrSize = 62;
    const qrX = x + (sticker - qrSize) / 2;
    const qrY = y + 16;
    pdf.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
    drawFinderCorners(pdf, qrX - 2, qrY - 2, qrSize + 4, brand);

    pdf.setFillColor(255, 255, 255);
    pdf.circle(x + sticker / 2, qrY + qrSize / 2, 7, "F");
    pdf.setTextColor(...brand);
    pdf.setFontSize(7);
    pdf.text(opts.tenantMonogram.slice(0, 2), x + sticker / 2, qrY + qrSize / 2 + 2, { align: "center" });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(18, 23, 20);
    pdf.text(item.serialLabel, x + sticker / 2, y + 86, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5);
    pdf.setTextColor(91, 103, 95);
    pdf.text(`${opts.tenantName} · ${opts.loteCode}`, x + sticker / 2, y + 92, { align: "center" });
    pdf.text("Asignar en terreno · OPAI", x + sticker / 2, y + 96, { align: "center" });
  }

  return Buffer.from(pdf.output("arraybuffer"));
}
