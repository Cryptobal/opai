import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  await params;
  const { searchParams } = new URL(request.url);
  const listType = searchParams.get("type") || "whitelist";

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(
    listType === "blacklist" ? "Lista Negra" : "Lista Blanca"
  );

  const headers =
    listType === "blacklist"
      ? ["RUT", "Nombre Completo", "Empresa", "Motivo"]
      : ["RUT", "Nombre Completo", "Empresa", "Vigencia Desde", "Vigencia Hasta"];

  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };

  if (listType === "blacklist") {
    ws.addRow(["12345678-9", "Juan Pérez González", "ACME S.A.", "Comportamiento agresivo"]);
  } else {
    ws.addRow([
      "12345678-9",
      "Juan Pérez González",
      "ACME S.A.",
      "2026-01-01",
      "2026-12-31",
    ]);
  }

  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = 22;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla_${listType}.xlsx"`,
    },
  });
}
