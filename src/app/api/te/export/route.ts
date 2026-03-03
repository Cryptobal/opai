import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly } from "@/lib/ops";
import { formatPersonName } from "@/lib/personas";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const fromRaw = request.nextUrl.searchParams.get("from");
    const toRaw = request.nextUrl.searchParams.get("to");
    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;

    const now = new Date();
    const from = fromRaw ? parseDateOnly(fromRaw) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = toRaw ? parseDateOnly(toRaw) : now;

    const teRows = await prisma.opsTurnoExtra.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: from, lte: to },
        status: { in: ["pending", "approved", "paid"] },
        ...(installationId && installationId !== "all" ? { installationId } : {}),
      },
      include: {
        installation: {
          select: {
            name: true,
            account: { select: { name: true } },
          },
        },
        puesto: { select: { name: true } },
        guardia: {
          select: {
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        asistencia: { select: { plannedGuardiaId: true } },
        refuerzoSolicitud: { select: { id: true } },
      },
      orderBy: [{ date: "asc" }, { installation: { name: "asc" } }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "OPAI";
    const ws = wb.addWorksheet("Turnos Extra");

    const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    const borderThin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFD1D5DB" } };
    const borders: Partial<ExcelJS.Borders> = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };

    const columns: Partial<ExcelJS.Column>[] = [
      { header: "Fecha", key: "date", width: 14 },
      { header: "Cliente", key: "client", width: 22 },
      { header: "Instalación", key: "installation", width: 22 },
      { header: "Puesto", key: "puesto", width: 20 },
      { header: "Guardia", key: "guard", width: 24 },
      { header: "RUT", key: "rut", width: 14 },
      { header: "Tipo", key: "tipo", width: 10 },
      { header: "Monto CLP", key: "amount", width: 14 },
      { header: "Estado", key: "status", width: 12 },
      { header: "Origen", key: "origin", width: 14 },
    ];
    ws.columns = columns;

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borders;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    headerRow.height = 28;

    const STATUS_LABELS: Record<string, string> = {
      approved: "Aprobado",
      paid: "Pagado",
      pending: "Pendiente",
      rejected: "Rechazado",
    };

    for (const te of teRows) {
      let origin = "PPC";
      if (te.refuerzoSolicitud) {
        origin = "Refuerzo";
      } else if (te.isManual && !te.asistenciaId) {
        origin = "Manual";
      } else if (te.asistenciaId && te.asistencia?.plannedGuardiaId) {
        origin = "Ausencia";
      }

      const row = ws.addRow({
        date: new Date(te.date).toLocaleDateString("es-CL"),
        client: te.installation.account?.name ?? "Sin cliente",
        installation: te.installation.name,
        puesto: te.puesto?.name ?? "—",
        guard: formatPersonName(te.guardia.persona.firstName, te.guardia.persona.lastName),
        rut: te.guardia.persona.rut ?? "—",
        tipo: te.tipo === "hora_extra" ? "Hora Extra" : "Turno Extra",
        amount: Number(te.amountClp),
        status: STATUS_LABELS[te.status] ?? te.status,
        origin,
      });

      row.eachCell((cell) => {
        cell.border = borders;
        cell.alignment = { vertical: "middle" };
      });
      const amountCell = row.getCell("amount");
      amountCell.numFmt = "#,##0";
      amountCell.alignment = { vertical: "middle", horizontal: "right" };
    }

    // Totals row
    if (teRows.length > 0) {
      const totalRow = ws.addRow({
        date: "",
        client: "",
        installation: "",
        puesto: "",
        guard: "",
        rut: "",
        tipo: "TOTAL",
        amount: teRows.reduce((sum, te) => sum + Number(te.amountClp), 0),
        status: `${teRows.length} registros`,
        origin: "",
      });
      totalRow.font = { bold: true };
      totalRow.eachCell((cell) => {
        cell.border = borders;
      });
      const totalAmtCell = totalRow.getCell("amount");
      totalAmtCell.numFmt = "#,##0";
      totalAmtCell.alignment = { vertical: "middle", horizontal: "right" };
    }

    ws.autoFilter = { from: "A1", to: `J${teRows.length + 1}` };

    const buffer = await wb.xlsx.writeBuffer();
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="turnos-extra-${fromStr}-a-${toStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[TE] Error exporting Excel:", error);
    return NextResponse.json({ success: false, error: "Error generando Excel" }, { status: 500 });
  }
}
