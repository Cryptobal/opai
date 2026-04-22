/**
 * GET /api/portal/cliente/instalaciones/[id]/marcaciones
 *
 * Marcaciones (entrada/salida de guardias) de una instalación del cliente.
 *
 * Hardening (PR6):
 *  - `requirePortalClienteAuth(request)` con anti-spoofing + `tenantId`.
 *  - `ensureInstallationAccess` para verificar tenant + account.
 *  - Filtros soportados: `from`, `to`, `tipo`, `gpsStatus`, `q`, `limit`.
 *  - Devuelve un `estado` derivado cliente-friendly:
 *      · `ok`          → GPS validado + foto.
 *      · `fuera_rango` → GPS fuera del radio geográfico.
 *      · `sin_gps`     → sin posición registrada.
 *      · `sin_foto`    → marcación sin evidencia fotográfica.
 *      (se elige el peor estado en orden: fuera_rango > sin_gps > sin_foto > ok)
 *  - Devuelve `resumen` con totales + KPIs por estado.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalClienteAuth,
  ensureInstallationAccess,
} from "@/lib/portal-cliente";
import {
  computeMarcacionEstado,
  VALID_ESTADOS,
  type MarcacionEstado,
} from "@/lib/portal-cliente-marcacion-estado";

const VALID_TIPOS = new Set(["entrada", "salida"]);

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: installationId } = await params;
    const ok = await ensureInstallationAccess(session, installationId);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: {
        id: installationId,
        accountId: session.accountId,
        tenantId: session.tenantId,
      },
      select: { id: true, name: true },
    });
    if (!installation) {
      // Defensa extra — no debería ocurrir si ensureInstallationAccess pasó.
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "100", 10)));
    const tipoRaw = sp.get("tipo");
    const tipo = tipoRaw && VALID_TIPOS.has(tipoRaw) ? tipoRaw : null;
    const estadoFilter = sp.get("estado") as MarcacionEstado | null;
    const estadoValid =
      estadoFilter && VALID_ESTADOS.has(estadoFilter) ? estadoFilter : null;
    const from = parseDate(sp.get("from"));
    const to = parseDate(sp.get("to"));
    const q = sp.get("q")?.trim().toLowerCase() ?? "";

    const timestampFilter: Record<string, Date> = {};
    if (from) timestampFilter.gte = from;
    if (to) timestampFilter.lte = to;

    const marcaciones = await prisma.opsMarcacion.findMany({
      where: {
        tenantId: session.tenantId,
        installationId,
        deletedAt: null,
        ...(tipo ? { tipo } : {}),
        ...(Object.keys(timestampFilter).length > 0
          ? { timestamp: timestampFilter }
          : {}),
      },
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    const mapped = marcaciones.map((m) => {
      const guardiaName = m.guardia?.persona
        ? `${m.guardia.persona.firstName ?? ""} ${m.guardia.persona.lastName ?? ""}`
            .trim()
        : "Guardia";
      const estado = computeMarcacionEstado({
        gpsStatus: m.gpsStatus ?? null,
        fotoEvidenciaUrl: m.fotoEvidenciaUrl ?? null,
        lat: m.lat ?? null,
        lng: m.lng ?? null,
      });

      return {
        id: m.id,
        tipo: m.tipo as "entrada" | "salida",
        timestamp:
          m.timestamp instanceof Date
            ? m.timestamp.toISOString()
            : String(m.timestamp),
        guardiaName,
        geoValidada: m.geoValidada,
        geoDistanciaM: m.geoDistanciaM ?? null,
        gpsStatus: m.gpsStatus ?? null,
        lat: m.lat ?? null,
        lng: m.lng ?? null,
        metodoId: m.metodoId ?? null,
        fotoEvidenciaUrl: m.fotoEvidenciaUrl ?? null,
        estado,
      };
    });

    // Filtros en memoria para los criterios derivados.
    const filtered = mapped.filter((m) => {
      if (estadoValid && m.estado !== estadoValid) return false;
      if (q && !m.guardiaName.toLowerCase().includes(q)) return false;
      return true;
    });

    const resumen = {
      total: filtered.length,
      entradas: filtered.filter((m) => m.tipo === "entrada").length,
      salidas: filtered.filter((m) => m.tipo === "salida").length,
      ok: filtered.filter((m) => m.estado === "ok").length,
      fueraRango: filtered.filter((m) => m.estado === "fuera_rango").length,
      sinGps: filtered.filter((m) => m.estado === "sin_gps").length,
      sinFoto: filtered.filter((m) => m.estado === "sin_foto").length,
    };

    return NextResponse.json({
      success: true,
      data: {
        installationName: installation.name,
        marcaciones: filtered,
        resumen,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] Marcaciones error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener marcaciones" },
      { status: 500 }
    );
  }
}
