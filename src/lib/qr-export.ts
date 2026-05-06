import QRCode from "qrcode";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export interface QrExportItem {
  name: string;
  code: string;
  installationName?: string;
}

/**
 * Genera un PNG individual de un QR con footer (nombre + código).
 * Retorna el blob.
 */
export async function generateQrPng(item: QrExportItem): Promise<Blob> {
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, item.code, {
    width: 640,
    margin: 2,
    errorCorrectionLevel: "H",
  });

  const footerHeight = 140;
  const canvas = document.createElement("canvas");
  canvas.width = qrCanvas.width;
  canvas.height = qrCanvas.height + footerHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qrCanvas, 0, 0);
  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  ctx.font = "bold 28px Arial, sans-serif";
  if (item.installationName) {
    ctx.fillText(item.installationName, canvas.width / 2, qrCanvas.height + 44);
  }
  ctx.font = "22px Arial, sans-serif";
  ctx.fillText(item.name, canvas.width / 2, qrCanvas.height + 78);
  ctx.font = "16px Arial, sans-serif";
  ctx.fillStyle = "#4b5563";
  ctx.fillText(item.code, canvas.width / 2, qrCanvas.height + 108);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate PNG blob"));
    }, "image/png");
  });
}

/**
 * Genera un PDF con todos los QR (4 por página: 2x2 con info abajo de c/u).
 */
export async function generateQrsPdf(
  items: QrExportItem[],
  installationName: string,
): Promise<void> {
  if (items.length === 0) return;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const cols = 2;
  const rows = 2;
  const perPage = cols * rows;
  const cellWidth = (pageWidth - margin * 2) / cols;
  const cellHeight = (pageHeight - margin * 2 - 15) / rows;

  const drawPageHeader = (pageNum: number, totalPages: number) => {
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Checkpoints QR — ${installationName}`, pageWidth / 2, 10, { align: "center" });
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120);
    pdf.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 5, {
      align: "right",
    });
    pdf.setTextColor(0);
  };

  const totalPages = Math.ceil(items.length / perPage);
  for (let i = 0; i < items.length; i++) {
    const indexInPage = i % perPage;
    if (indexInPage === 0) {
      if (i > 0) pdf.addPage();
      drawPageHeader(Math.floor(i / perPage) + 1, totalPages);
    }
    const item = items[i];
    const col = indexInPage % cols;
    const row = Math.floor(indexInPage / cols);
    const x = margin + col * cellWidth;
    const y = margin + 12 + row * cellHeight;

    const qrDataUrl = await QRCode.toDataURL(item.code, {
      width: 400,
      margin: 1,
      errorCorrectionLevel: "H",
    });

    const qrSize = Math.min(cellWidth, cellHeight) - 25;
    const qrX = x + (cellWidth - qrSize) / 2;
    const qrY = y;
    pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(item.name, x + cellWidth / 2, qrY + qrSize + 6, {
      align: "center",
      maxWidth: cellWidth - 4,
    });
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(80);
    pdf.text(item.code, x + cellWidth / 2, qrY + qrSize + 11, {
      align: "center",
      maxWidth: cellWidth - 4,
    });
    pdf.setTextColor(0);
  }

  const safeInstallName = installationName.replace(/[^a-zA-Z0-9]+/g, "-");
  pdf.save(`QRs-${safeInstallName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Genera un ZIP con un PNG por cada QR.
 */
export async function generateQrsZip(
  items: QrExportItem[],
  installationName: string,
): Promise<void> {
  if (items.length === 0) return;

  const zip = new JSZip();
  const folder = zip.folder("qrs") ?? zip;

  for (const item of items) {
    const blob = await generateQrPng({ ...item, installationName });
    const safeName = item.name.replace(/[^a-zA-Z0-9]+/g, "-");
    folder.file(`QR-${safeName}-${item.code}.png`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const safeInstallName = installationName.replace(/[^a-zA-Z0-9]+/g, "-");
  saveAs(zipBlob, `QRs-${safeInstallName}-${new Date().toISOString().slice(0, 10)}.zip`);
}
