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
      isModified: true,
      modifiedAt: { gte: startDate, lte: endDate },
      deletedAt: null,
    };
    if (installationId) where.installationId = installationId;

    const marcaciones = await prisma.opsMarcacion.findMany({
      where,
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        modifiedAt: true,
        modifiedBy: true,
        modificationReason: true,
        opposedAt: true,
        opposedBy: true,
        oppositionReason: true,
        consolidatedAt: true,
        guardia: {
          select: {
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        installation: { select: { name: true } },
      },
      orderBy: { modifiedAt: "desc" },
    });

    // Batch audit log lookup for original timestamps
    const ids = marcaciones.map((m) => m.id);
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity: "ops_marcacion", entityId: { in: ids }, action: "ops.marcacion.modified" },
      select: { entityId: true, details: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const auditLatest = new Map<string, typeof auditLogs[0]>();
    for (const a of auditLogs) {
      if (a.entityId && !auditLatest.has(a.entityId)) auditLatest.set(a.entityId, a);
    }

    const fmtHora = (d: Date | string | null | undefined) =>
      d ? new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }) : "";

    const wb = new ExcelJS.Workbook();
    wb.creator = "OPAI";
    const ws = wb.addWorksheet("Modificaciones de Turnos");

    ws.columns = [
      { header: "Fecha Mod.", key: "fecha_mod", width: 14 },
      { header: "RUT", key: "rut", width: 13 },
      { header: "Apellido", key: "apellido", width: 18 },
      { header: "Nombre", key: "nombre", width: 16 },
      { header: "Instalación", key: "instalacion", width: 22 },
      { header: "Tipo", key: "tipo", width: 10 },
      { header: "Hora Original", key: "hora_original", width: 14 },
      { header: "Hora Nueva", key: "hora_nueva", width: 14 },
      { header: "Motivo", key: "motivo", width: 28 },
      { header: "Modificado Por", key: "modificado_por", width: 18 },
      { header: "Estado", key: "estado", width: 14 },
      { header: "Motivo Oposición", key: "motivo_oposicion", width: 28 },
    ];

    // Header styling
    ws.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });

    for (const m of marcaciones) {
      const audit = auditLatest.get(m.id);
      const details = audit?.details as Record<string, unknown> | null;
      const changes = details?.changes as Record<string, unknown> | undefined;
      const ts = changes?.timestamp as Record<string, unknown> | undefined;
      const horaOriginal = fmtHora((ts?.from as string) ?? null);

      const estado = m.consolidatedAt ? "Consolidada" : m.opposedAt ? "Opuesta" : "Pendiente";

      ws.addRow({
        fecha_mod: m.modifiedAt ? new Date(m.modifiedAt).toLocaleDateString("es-CL") : "",
        rut: m.guardia.persona.rut ?? "",
        apellido: m.guardia.persona.lastName,
        nombre: m.guardia.persona.firstName,
        instalacion: m.installation.name,
        tipo: m.tipo === "entrada" ? "Entrada" : "Salida",
        hora_original: horaOriginal,
        hora_nueva: fmtHora(m.timestamp),
        motivo: m.modificationReason ?? "",
        modificado_por: m.modifiedBy ?? "",
        estado,
        motivo_oposicion: m.oppositionReason ?? "",
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="modificaciones-turnos-${from}-${to}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[DT] Error export-excel modificaciones-turnos:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
