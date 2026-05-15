import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  const session = await requirePortalClienteAuth(request);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { installationId } = await params;
  if (!(await ensureInstallationAccess(session, installationId))) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lista Blanca");
  const headers = [
    "RUT",
    "Nombre Completo",
    "Empresa",
    "Patente",
    "Vigencia Desde",
    "Vigencia Hasta",
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.addRow([
    "12345678-9",
    "Juan Pérez González",
    "ACME S.A.",
    "ABCD12",
    "2026-01-01",
    "2026-12-31",
  ]);
  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = 22;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla_whitelist.xlsx"`,
    },
  });
}
