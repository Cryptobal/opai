/**
 * GET /api/ops/installations/[id]/marcaciones?date=YYYY-MM-DD
 * Devuelve marcaciones del día dado para todos los guardias de la instalación.
 * Agrupa por guardia: entrada + salida del día.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

type Params = { id: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const sp = request.nextUrl.searchParams;

    const dateStr = sp.get("date") ?? new Date().toISOString().slice(0, 10);
    const [y, mo, d] = dateStr.split("-").map(Number);
    const dayStart = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));

    const installation = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const marcaciones = await prisma.opsMarcacion.findMany({
      where: {
        installationId: id,
        tenantId: ctx.tenantId,
        timestamp: { gte: dayStart, lte: dayEnd },
        deletedAt: null,
      },
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        metodoId: true,
        gpsStatus: true,
        atrasoMinutos: true,
        isModified: true,
        modifiedAt: true,
        modificationReason: true,
        opposedAt: true,
        consolidatedAt: true,
        guardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // Agrupar por guardia con entrada/salida separadas
    const byGuardia = new Map<string, {
      guardiaId: string;
      guardiaName: string;
      entradas: typeof marcaciones;
      salidas: typeof marcaciones;
    }>();

    for (const m of marcaciones) {
      const key = m.guardia.id;
      if (!byGuardia.has(key)) {
        byGuardia.set(key, {
          guardiaId: m.guardia.id,
          guardiaName: `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`,
          entradas: [],
          salidas: [],
        });
      }
      const g = byGuardia.get(key)!;
      if (m.tipo === "entrada") g.entradas.push(m);
      else g.salidas.push(m);
    }

    const serializeMarcacion = (m: typeof marcaciones[number]) => ({
      id: m.id,
      timestamp: m.timestamp.toISOString(),
      metodoId: m.metodoId,
      gpsStatus: m.gpsStatus,
      atrasoMinutos: m.atrasoMinutos,
      isModified: m.isModified,
      modificationReason: m.modificationReason,
      opposedAt: m.opposedAt?.toISOString() ?? null,
      consolidatedAt: m.consolidatedAt?.toISOString() ?? null,
    });

    const rows = Array.from(byGuardia.values()).map((g) => ({
      guardiaId: g.guardiaId,
      guardiaName: g.guardiaName,
      entrada: g.entradas[0] ? serializeMarcacion(g.entradas[0]) : null,
      salida: g.salidas[0] ? serializeMarcacion(g.salidas[0]) : null,
    }));

    const summary = {
      totalGuardias: rows.length,
      conEntrada: rows.filter((r) => r.entrada).length,
      conSalida: rows.filter((r) => r.salida).length,
      sinSalida: rows.filter((r) => r.entrada && !r.salida).length,
      conAtraso: rows.filter((r) => (r.entrada?.atrasoMinutos ?? 0) > 0).length,
      modificadas: marcaciones.filter((m) => m.isModified).length,
    };

    return NextResponse.json({ success: true, data: { rows, summary, date: dateStr } });
  } catch (error) {
    console.error("[OPS] Error fetching installation marcaciones:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
