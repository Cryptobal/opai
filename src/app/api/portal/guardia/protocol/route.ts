/**
 * API Route: /api/portal/guardia/protocol
 * GET - Get published protocol for the guard's current installation
 *
 * Query: ?guardiaId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId requerido" },
        { status: 401 },
      );
    }

    // Get guard and their current installation
    const guard = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: {
        tenantId: true,
        currentInstallationId: true,
        persona: { select: { firstName: true, lastName: true } },
      },
    });

    if (!guard || !guard.currentInstallationId) {
      return NextResponse.json(
        { success: false, error: "Sin instalación asignada" },
        { status: 404 },
      );
    }

    const installationId = guard.currentInstallationId;

    // Get installation name
    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { name: true },
    });

    // Get latest published version
    const version = await prisma.opsProtocolVersion.findFirst({
      where: {
        tenantId: guard.tenantId,
        installationId,
        status: "published",
      },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true, publishedAt: true },
    });

    // Get protocol sections with items
    const sections = await prisma.opsProtocolSection.findMany({
      where: { tenantId: guard.tenantId, installationId },
      include: {
        items: { orderBy: { order: "asc" } },
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        installationName: installation?.name ?? "—",
        version: version?.versionNumber ?? null,
        publishedAt: version?.publishedAt?.toISOString() ?? null,
        sections: sections.map((s) => ({
          id: s.id,
          title: s.title,
          icon: s.icon,
          items: s.items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
          })),
        })),
      },
    });
  } catch (error) {
    console.error("[PORTAL][GUARD] Error fetching protocol:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener protocolo" },
      { status: 500 },
    );
  }
}
