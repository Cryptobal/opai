import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { formatPersonName } from "@/lib/personas";
import ExcelJS from "exceljs";

/**
 * GET /api/ops/rondas/reportes/export-instalacion
 *
 * Generates a 3-sheet Excel workbook for a single installation over a date range:
 *   1. Resumen — period summary KPIs
 *   2. Grilla Cumplimiento — days x slots compliance grid
 *   3. Detalle Rondas — one row per ejecucion with full detail
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const installationId = sp.get("installationId");
    const from = sp.get("from");
    const to = sp.get("to");
    const cicloInicio = parseInt(sp.get("cicloInicio") ?? "20", 10);

    if (!installationId || !from || !to) {
      return NextResponse.json(
        { success: false, error: "installationId, from y to son requeridos" },
        { status: 400 },
      );
    }

    const diffDays = Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays > 30 || diffDays < 0) {
      return NextResponse.json(
        { success: false, error: "Rango máximo: 30 días" },
        { status: 400 },
      );
    }

    // Installation name
    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { name: true },
    });
    const installationName = installation?.name ?? "Instalación";

    const rangeStart = new Date(`${from}T${String(cicloInicio).padStart(2, "0")}:00:00`);
    const lastDayEnd = new Date(`${to}T${String(cicloInicio).padStart(2, "0")}:00:00`);
    lastDayEnd.setTime(lastDayEnd.getTime() + 24 * 60 * 60 * 1000);

    // All ejecuciones
    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: ctx.tenantId,
        scheduledAt: { gte: rangeStart, lt: lastDayEnd },
        OR: [{ installationId }, { rondaTemplate: { installationId } }],
      },
      include: {
        guardia: {
          select: { persona: { select: { firstName: true, lastName: true } } },
        },
        rondaTemplate: { select: { name: true } },
        _count: { select: { marcaciones: true, incidentes: true, alertasRows: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // Alertas
    const alertas = await prisma.opsAlertaRonda.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        createdAt: { gte: rangeStart, lt: lastDayEnd },
      },
      select: { id: true, tipo: true, ejecucionId: true, createdAt: true },
    });

    // Build slots from actual ejecuciones
    const slots = buildSlotsFromEjecuciones(ejecuciones, cicloInicio);

    // ── Build grid data ──
    type GridCell = { completadas: number; esperadas: number; slotKey: string };
    const gridDays: Array<{ dayLabel: string; cells: GridCell[]; totalC: number; totalE: number }> = [];

    const startDate = new Date(from);
    const endDate = new Date(to);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split("T")[0];
      const cycleStart = new Date(`${dayStr}T${String(cicloInicio).padStart(2, "0")}:00:00`);
      const cycleEnd = new Date(cycleStart.getTime() + 24 * 60 * 60 * 1000);

      const dayEjecuciones = ejecuciones.filter((ej) => {
        const t = new Date(ej.scheduledAt).getTime();
        return t >= cycleStart.getTime() && t < cycleEnd.getTime();
      });

      const cells = slots.map((slot) => {
        const slotHour = parseInt(slot.label.split(":")[0], 10);

        const slotEjs = dayEjecuciones.filter((ej) => {
          const ejHour = parseInt(
            new Date(ej.scheduledAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              hour12: false,
              timeZone: "America/Santiago",
            }),
            10,
          );
          return ejHour === slotHour;
        });

        return {
          slotKey: slot.label,
          completadas: slotEjs.filter((ej) => ej.status === "completada").length,
          esperadas: slotEjs.length, // data-driven from actual ejecuciones
        };
      });

      gridDays.push({
        dayLabel: new Date(dayStr + "T12:00:00").toLocaleDateString("es-CL", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
        cells,
        totalC: cells.reduce((s, c) => s + c.completadas, 0),
        totalE: cells.reduce((s, c) => s + c.esperadas, 0),
      });
    }

    const totalEsperadas = gridDays.reduce((s, d) => s + d.totalE, 0);
    const completadasTotal = ejecuciones.filter((e) => e.status === "completada").length;
    const incompletasTotal = ejecuciones.filter((e) => e.status === "incompleta").length;
    const noRealizadasTotal = ejecuciones.filter(
      (e) => e.status === "no_realizada" || e.status === "pendiente",
    ).length;
    const cumplimiento = totalEsperadas > 0 ? Math.round((completadasTotal / totalEsperadas) * 100) : 0;

    // ── Build Excel ──
    const wb = new ExcelJS.Workbook();
    wb.creator = "OPAI";
    wb.created = new Date();

    const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1F2E" } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFF1F5F9" }, size: 11 };

    // ── Sheet 1: Resumen ──
    const ws1 = wb.addWorksheet("Resumen");
    ws1.columns = [
      { header: "Campo", key: "campo", width: 28 },
      { header: "Valor", key: "valor", width: 30 },
    ];
    ws1.getRow(1).font = headerFont;
    ws1.getRow(1).fill = headerFill;

    ws1.addRows([
      { campo: "Instalación", valor: installationName },
      { campo: "Período", valor: `${from} — ${to}` },
      { campo: "Total rondas ejecutadas", valor: ejecuciones.length },
      { campo: "Total rondas esperadas", valor: totalEsperadas },
      { campo: "Completadas", valor: completadasTotal },
      { campo: "Incompletas", valor: incompletasTotal },
      { campo: "No realizadas", valor: noRealizadasTotal },
      { campo: "Cumplimiento", valor: `${cumplimiento}%` },
      { campo: "Alertas de pánico", valor: alertas.filter((a) => a.tipo === "panico").length },
      { campo: "Total alertas", valor: alertas.length },
    ]);

    // ── Sheet 2: Grilla Cumplimiento ──
    const ws2 = wb.addWorksheet("Grilla Cumplimiento");
    const slotLabels = slots.map((s) => s.label);
    ws2.columns = [
      { header: "Día", key: "dia", width: 16 },
      ...slotLabels.map((h) => ({ header: h, key: h, width: 10 })),
      { header: "Total", key: "total", width: 10 },
    ];
    ws2.getRow(1).font = headerFont;
    ws2.getRow(1).fill = headerFill;
    ws2.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 1 }];

    const greenFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4EDDA" } };
    const yellowFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
    const redFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D7DA" } };

    for (const day of gridDays) {
      const rowData: Record<string, string> = { dia: day.dayLabel };
      day.cells.forEach((cell) => {
        rowData[cell.slotKey] = `${cell.completadas}/${cell.esperadas}`;
      });
      rowData.total = `${day.totalC}/${day.totalE}`;
      const excelRow = ws2.addRow(rowData);

      // Conditional formatting
      day.cells.forEach((cell, i) => {
        const excelCell = excelRow.getCell(i + 2);
        if (cell.esperadas === 0) return;
        if (cell.completadas === cell.esperadas) {
          excelCell.fill = greenFill;
        } else if (cell.completadas > 0) {
          excelCell.fill = yellowFill;
        } else {
          excelCell.fill = redFill;
        }
      });
    }

    // Footer totals row
    const footerData: Record<string, string> = { dia: "Total" };
    slots.forEach((slot, i) => {
      const colC = gridDays.reduce((s, d) => s + d.cells[i].completadas, 0);
      const colE = gridDays.reduce((s, d) => s + d.cells[i].esperadas, 0);
      footerData[slot.label] = `${colC}/${colE}`;
    });
    footerData.total = `${completadasTotal}/${totalEsperadas}`;
    const footerRow = ws2.addRow(footerData);
    footerRow.font = { bold: true };

    // ── Sheet 3: Detalle Rondas ──
    const ws3 = wb.addWorksheet("Detalle Rondas");
    ws3.columns = [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Hora Inicio", key: "horaInicio", width: 12 },
      { header: "Hora Fin", key: "horaFin", width: 12 },
      { header: "Plantilla", key: "plantilla", width: 22 },
      { header: "Guardia", key: "guardia", width: 25 },
      { header: "Estado", key: "estado", width: 15 },
      { header: "Checkpoints", key: "checkpoints", width: 13 },
      { header: "Cumplimiento", key: "cumplimiento", width: 14 },
      { header: "Trust Score", key: "trust", width: 12 },
      { header: "Duración (min)", key: "duracion", width: 14 },
      { header: "Incidentes", key: "incidentes", width: 12 },
      { header: "Alertas", key: "alertas", width: 12 },
    ];
    ws3.getRow(1).font = headerFont;
    ws3.getRow(1).fill = headerFill;
    ws3.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];

    for (const ej of ejecuciones) {
      const guardiaNombre = ej.guardia?.persona
        ? formatPersonName(ej.guardia.persona.firstName, ej.guardia.persona.lastName)
        : "Sin asignar";

      ws3.addRow({
        fecha: ej.scheduledAt.toLocaleDateString("es-CL"),
        horaInicio: ej.startedAt
          ? ej.startedAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
          : "—",
        horaFin: ej.completedAt
          ? ej.completedAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
          : "—",
        plantilla: ej.rondaTemplate?.name ?? "Ronda Libre",
        guardia: guardiaNombre,
        estado: ej.status,
        checkpoints: `${ej.checkpointsCompletados}/${ej.checkpointsTotal}`,
        cumplimiento: `${Math.round(ej.porcentajeCompletado)}%`,
        trust: ej.trustScore ?? "—",
        duracion: ej.durationMinutes ?? "—",
        incidentes: ej._count.incidentes,
        alertas: ej._count.alertasRows,
      });
    }

    // Generate buffer
    const buffer = await wb.xlsx.writeBuffer();
    const safeInstName = installationName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, "").trim();
    const filename = `reporte-rondas-${safeInstName}-${from}-${to}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[RONDAS] export-instalacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// ── Slot builder (shared logic with instalacion-detalle) ──

interface SlotDef {
  label: string;
  offsetMinutes: number;
  durationMinutes: number;
  expectedCount: number;
}

function buildSlotsFromEjecuciones(
  ejecuciones: Array<{ scheduledAt: Date }>,
  cicloInicio: number,
): SlotDef[] {
  const hours = new Set<number>();

  for (const ej of ejecuciones) {
    const localHour = parseInt(
      new Date(ej.scheduledAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: "America/Santiago",
      }),
      10,
    );
    hours.add(localHour);
  }

  if (hours.size === 0) return [];

  const sortedHours = [...hours].sort((a, b) => {
    const aOff = a >= cicloInicio ? a - cicloInicio : a + 24 - cicloInicio;
    const bOff = b >= cicloInicio ? b - cicloInicio : b + 24 - cicloInicio;
    return aOff - bOff;
  });

  return sortedHours.map((hour) => ({
    label: `${String(hour).padStart(2, "0")}:00`,
    offsetMinutes: (hour >= cicloInicio ? hour - cicloInicio : hour + 24 - cicloInicio) * 60,
    durationMinutes: 60,
    expectedCount: 0,
  }));
}
