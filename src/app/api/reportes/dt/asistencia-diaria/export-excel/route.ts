import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { from, to, installationId } = await request.json();

    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const startDate = new Date(Date.UTC(fy, fm - 1, fd));
    const endDate = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      date: { gte: startDate, lte: endDate },
      deletedAt: null,
    };
    if (installationId) where.installationId = installationId;

    const records = await prisma.opsAsistenciaDiaria.findMany({
      where,
      select: {
        date: true,
        attendanceStatus: true,
        checkInAt: true,
        checkOutAt: true,
        workedMinutes: true,
        overtimeMinutes: true,
        plannedGuardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
        installation: { select: { name: true } },
        puesto: { select: { name: true } },
        marcacionEntrada: { select: { timestamp: true, isModified: true, atrasoMinutos: true } },
        marcacionSalida: { select: { timestamp: true, isModified: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "OPAI";
    const ws = wb.addWorksheet("Asistencia Diaria");

    ws.columns = [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "RUT", key: "rut", width: 13 },
      { header: "Apellido", key: "apellido", width: 18 },
      { header: "Nombre", key: "nombre", width: 16 },
      { header: "Instalación", key: "instalacion", width: 22 },
      { header: "Puesto", key: "puesto", width: 18 },
      { header: "Estado", key: "estado", width: 14 },
      { header: "Entrada", key: "entrada", width: 10 },
      { header: "Salida", key: "salida", width: 10 },
      { header: "Horas Norm.", key: "horas_norm", width: 12 },
      { header: "Horas Extra", key: "horas_extra", width: 12 },
      { header: "Atraso (min)", key: "atraso", width: 12 },
      { header: "Modificada", key: "modificada", width: 12 },
    ];

    // Header styling
    ws.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });

    for (const r of records) {
      const fmtHora = (d: Date | null | undefined) =>
        d ? new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }) : "";

      ws.addRow({
        fecha: new Date(r.date).toLocaleDateString("es-CL"),
        rut: r.plannedGuardia?.persona.rut ?? "",
        apellido: r.plannedGuardia?.persona.lastName ?? "",
        nombre: r.plannedGuardia?.persona.firstName ?? "",
        instalacion: r.installation.name,
        puesto: r.puesto?.name ?? "",
        estado: r.attendanceStatus,
        entrada: fmtHora(r.marcacionEntrada?.timestamp ?? r.checkInAt),
        salida: fmtHora(r.marcacionSalida?.timestamp ?? r.checkOutAt),
        horas_norm: r.workedMinutes ? Math.round((r.workedMinutes / 60) * 100) / 100 : "",
        horas_extra: r.overtimeMinutes ? Math.round((r.overtimeMinutes / 60) * 100) / 100 : "",
        atraso: r.marcacionEntrada?.atrasoMinutos ?? "",
        modificada: (r.marcacionEntrada?.isModified || r.marcacionSalida?.isModified) ? "Sí" : "No",
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="asistencia-diaria-${from}-${to}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[DT] Error export-excel asistencia-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
