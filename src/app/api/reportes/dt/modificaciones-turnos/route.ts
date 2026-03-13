/**
 * GET /api/reportes/dt/modificaciones-turnos?from=YYYY-MM-DD&to=YYYY-MM-DD&installationId=...
 * Devuelve marcaciones modificadas (isModified=true) con su estado de oposición.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const installationId = sp.get("installationId");

    if (!from || !to) {
      return NextResponse.json({ success: false, error: "Parámetros from/to requeridos" }, { status: 400 });
    }

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
        isModified: true,
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

    // Recuperar timestamps originales desde AuditLog (batch)
    const marcacionIds = marcaciones.map((m) => m.id);
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: "ops_marcacion",
        entityId: { in: marcacionIds },
        action: "ops.marcacion.modified",
      },
      select: { entityId: true, details: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Deduplicate: keep most recent entry per entityId
    const auditLatest = new Map<string, typeof auditLogs[0]>();
    for (const a of auditLogs) {
      if (a.entityId && !auditLatest.has(a.entityId)) auditLatest.set(a.entityId, a);
    }

    const data = marcaciones.map((m) => {
      const audit = auditLatest.get(m.id);
      const details = audit?.details as Record<string, unknown> | null;
      const changes = details?.changes as Record<string, unknown> | undefined;
      const ts = changes?.timestamp as Record<string, unknown> | undefined;
      const timestampOriginal = (ts?.from as string) ?? null;

      const estado: "pendiente" | "opuesta" | "consolidada" = m.consolidatedAt
        ? "consolidada"
        : m.opposedAt
        ? "opuesta"
        : "pendiente";

      return {
        id: m.id,
        tipo: m.tipo,
        timestamp: m.timestamp.toISOString(),
        timestampOriginal,
        modifiedAt: m.modifiedAt?.toISOString() ?? null,
        modifiedBy: m.modifiedBy,
        modificationReason: m.modificationReason,
        estado,
        opposedAt: m.opposedAt?.toISOString() ?? null,
        opposedBy: m.opposedBy,
        oppositionReason: m.oppositionReason,
        consolidatedAt: m.consolidatedAt?.toISOString() ?? null,
        guardiaRut: m.guardia.persona.rut ?? "",
        guardiaLastName: m.guardia.persona.lastName,
        guardiaFirstName: m.guardia.persona.firstName,
        installationName: m.installation.name,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[DT] Error modificaciones-turnos:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
