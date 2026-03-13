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

    // Agrupar por guardia
    const byGuardia = new Map<string, { guardiaId: string; guardiaName: string; marcaciones: typeof marcaciones }>();
    for (const m of marcaciones) {
      const gId = m.guardia.id;
      if (!byGuardia.has(gId)) {
        byGuardia.set(gId, {
          guardiaId: gId,
          guardiaName: `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`,
          marcaciones: [],
        });
      }
      byGuardia.get(gId)!.marcaciones.push(m);
    }

    // Summary stats
    const totalGuardias = byGuardia.size;
    const totalEntradas = marcaciones.filter(m => m.tipo === "entrada").length;
    const totalSalidas = marcaciones.filter(m => m.tipo === "salida").length;
    const totalModificadas = marcaciones.filter(m => m.isModified).length;

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        installationName: installation.name,
        guardias: Array.from(byGuardia.values()).map(g => ({
          ...g,
          marcaciones: g.marcaciones.map(m => ({
            id: m.id,
            tipo: m.tipo,
            timestamp: m.timestamp.toISOString(),
            metodoId: m.metodoId,
            gpsStatus: m.gpsStatus,
            atrasoMinutos: m.atrasoMinutos,
            isModified: m.isModified,
            modifiedAt: m.modifiedAt?.toISOString() ?? null,
            modificationReason: m.modificationReason,
            opposedAt: m.opposedAt?.toISOString() ?? null,
            consolidatedAt: m.consolidatedAt?.toISOString() ?? null,
          })),
        })),
        stats: {
          totalGuardias,
          totalEntradas,
          totalSalidas,
          totalModificadas,
        },
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching installation marcaciones:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
