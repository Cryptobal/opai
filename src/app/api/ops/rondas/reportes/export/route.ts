import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { formatPersonName } from "@/lib/personas";
import ExcelJS from "exceljs";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const format = sp.get("format") ?? "xlsx";
    const installationId = sp.get("installationId");
    const guardiaId = sp.get("guardiaId");
    const statusFilter = sp.get("status");

    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to + "T23:59:59.999Z") : new Date();

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      scheduledAt: { gte: dateFrom, lte: dateTo },
    };
    if (installationId) where.installationId = installationId;
    if (guardiaId) where.guardiaId = guardiaId;
    if (statusFilter && statusFilter !== "all") where.status = statusFilter;

    const rows = await prisma.opsRondaEjecucion.findMany({
      where,
      include: {
        rondaTemplate: {
          select: {
            name: true,
            installation: { select: { name: true } },
          },
        },
        installation: { select: { name: true } },
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        marcaciones: {
          select: {
            id: true,
            timestamp: true,
            status: true,
            lat: true,
            lng: true,
            geoValidada: true,
            geoDistanciaM: true,
            verificationMethod: true,
            hashIntegridad: true,
            fotoEvidenciaUrl: true,
            checkpoint: { select: { name: true } },
          },
          orderBy: { timestamp: "asc" },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 2000,
    });

    if (format === "csv") {
      const header = "Fecha,Instalacion,Plantilla,Guardia,RUT,Estado,Checkpoints Total,Checkpoints Completados,Cumplimiento%,Trust Score,Duracion(min)";
      const lines = rows.map((r) => {
        const guardia = r.guardia ? formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName) : "";
        return [
          r.scheduledAt.toISOString(),
          r.rondaTemplate?.installation?.name ?? (r as any).installation?.name ?? "",
          r.rondaTemplate?.name ?? (r.isAdHoc ? "Ronda Libre" : ""),
          guardia,
          r.guardia?.persona.rut ?? "",
          r.status,
          r.checkpointsTotal,
          r.checkpointsCompletados,
          Math.round(r.porcentajeCompletado),
          r.trustScore ?? "",
          r.durationMinutes ?? "",
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(",");
      });
      return new NextResponse([header, ...lines].join("\n"), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="rondas-${dateFrom.toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // XLSX export
    const wb = new ExcelJS.Workbook();
    wb.creator = "OPAI";
    wb.created = new Date();

    // ── Sheet 1: Rondas ──
    const ws1 = wb.addWorksheet("Rondas");
    ws1.columns = [
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Instalacion", key: "instalacion", width: 25 },
      { header: "Plantilla", key: "plantilla", width: 20 },
      { header: "Guardia", key: "guardia", width: 22 },
      { header: "RUT", key: "rut", width: 14 },
      { header: "Estado", key: "estado", width: 14 },
      { header: "CP Total", key: "cpTotal", width: 10 },
      { header: "CP Completados", key: "cpCompleted", width: 14 },
      { header: "Cumplimiento %", key: "cumplimiento", width: 14 },
      { header: "Trust Score", key: "trust", width: 12 },
      { header: "Duracion (min)", key: "duracion", width: 14 },
      { header: "Inicio", key: "inicio", width: 20 },
      { header: "Fin", key: "fin", width: 20 },
    ];

    // Header styling
    ws1.getRow(1).font = { bold: true, size: 11 };
    ws1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1F2E" } };
    ws1.getRow(1).font = { bold: true, color: { argb: "FFF1F5F9" } };
    ws1.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

    for (const r of rows) {
      const guardia = r.guardia ? formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName) : "";
      ws1.addRow({
        fecha: r.scheduledAt.toISOString().replace("T", " ").slice(0, 19),
        instalacion: r.rondaTemplate?.installation?.name ?? (r as any).installation?.name ?? "",
        plantilla: r.rondaTemplate?.name ?? (r.isAdHoc ? "Ronda Libre" : ""),
        guardia,
        rut: r.guardia?.persona.rut ?? "",
        estado: r.status,
        cpTotal: r.checkpointsTotal,
        cpCompleted: r.checkpointsCompletados,
        cumplimiento: Math.round(r.porcentajeCompletado),
        trust: r.trustScore ?? 0,
        duracion: r.durationMinutes ?? "",
        inicio: r.startedAt ? r.startedAt.toISOString().replace("T", " ").slice(0, 19) : "",
        fin: r.completedAt ? r.completedAt.toISOString().replace("T", " ").slice(0, 19) : "",
      });
    }

    // ── Sheet 2: Marcaciones ──
    const ws2 = wb.addWorksheet("Marcaciones");
    ws2.columns = [
      { header: "Ronda Fecha", key: "rondaFecha", width: 20 },
      { header: "Guardia", key: "guardia", width: 22 },
      { header: "Checkpoint", key: "checkpoint", width: 20 },
      { header: "Hora Marcacion", key: "hora", width: 20 },
      { header: "Estado", key: "estado", width: 12 },
      { header: "Metodo", key: "metodo", width: 10 },
      { header: "Latitud", key: "lat", width: 14 },
      { header: "Longitud", key: "lng", width: 14 },
      { header: "Google Maps", key: "maps", width: 45 },
      { header: "Precision GPS (m)", key: "accuracy", width: 16 },
      { header: "Geo Validada", key: "geoOk", width: 12 },
      { header: "Confianza Geo", key: "geoConf", width: 14 },
      { header: "Distancia (m)", key: "distancia", width: 14 },
      { header: "Foto", key: "foto", width: 8 },
      { header: "Hash Integridad", key: "hash", width: 40 },
    ];

    ws2.getRow(1).font = { bold: true, size: 11 };
    ws2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1F2E" } };
    ws2.getRow(1).font = { bold: true, color: { argb: "FFF1F5F9" } };
    ws2.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

    for (const r of rows) {
      const guardia = r.guardia ? formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName) : "";
      for (const m of r.marcaciones) {
        const mapsUrl = m.lat && m.lng ? `https://maps.google.com/?q=${m.lat},${m.lng}` : "";
        ws2.addRow({
          rondaFecha: r.scheduledAt.toISOString().replace("T", " ").slice(0, 19),
          guardia,
          checkpoint: m.checkpoint?.name ?? "GPS Point",
          hora: m.timestamp.toISOString().replace("T", " ").slice(0, 19),
          estado: m.status ?? "COMPLETED",
          metodo: m.verificationMethod ?? "-",
          lat: m.lat,
          lng: m.lng,
          maps: mapsUrl,
          accuracy: "",
          geoOk: m.geoValidada ? "Si" : "No",
          geoConf: "-",
          distancia: m.geoDistanciaM != null ? Math.round(m.geoDistanciaM) : "",
          foto: m.fotoEvidenciaUrl ? "Si" : "No",
          hash: m.hashIntegridad ?? "",
        });

        // Make Google Maps URL a hyperlink
        if (mapsUrl) {
          const rowNum = ws2.rowCount;
          const cell = ws2.getCell(`I${rowNum}`);
          cell.value = { text: mapsUrl, hyperlink: mapsUrl };
          cell.font = { color: { argb: "FF3B82F6" }, underline: true };
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `rondas-${dateFrom.toISOString().slice(0, 10)}-${dateTo.toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[RONDAS] export", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
