import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

/**
 * GET /api/portal/cliente/instalaciones/[id]/marcaciones
 *
 * Returns recent guard marcaciones (check-ins/check-outs) for a specific
 * installation belonging to the authenticated client's account.
 * Includes photos, GPS data, and guard name.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: installationId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

    // Verify installation belongs to the client's account
    const installation = await prisma.crmInstallation.findFirst({
      where: {
        id: installationId,
        accountId: session.accountId,
        status: "active",
      },
      select: { id: true, name: true },
    });

    if (!installation) {
      return NextResponse.json({ error: "Instalación no encontrada" }, { status: 404 });
    }

    // Fetch recent marcaciones for this installation
    const marcaciones = await prisma.opsMarcacion.findMany({
      where: {
        installationId,
        tenantId: session.tenantId,
        deletedAt: null,
      },
      include: {
        guardia: {
          include: {
            persona: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    const data = marcaciones.map((m) => ({
      id: m.id,
      tipo: m.tipo as "entrada" | "salida",
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
      guardiaName: m.guardia?.persona
        ? `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`.trim()
        : "Guardia",
      geoValidada: m.geoValidada,
      geoDistanciaM: m.geoDistanciaM ?? null,
      gpsStatus: m.gpsStatus ?? null,
      lat: m.lat ?? null,
      lng: m.lng ?? null,
      metodoId: m.metodoId ?? null,
      fotoEvidenciaUrl: m.fotoEvidenciaUrl ?? null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        installationName: installation.name,
        marcaciones: data,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] Marcaciones error:", error);
    return NextResponse.json(
      { error: "Error al obtener marcaciones" },
      { status: 500 }
    );
  }
}
