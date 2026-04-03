import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

/* ── GET /api/portal/guardia/protocol ────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
      select: { id: true, currentInstallationId: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    if (!guardia.currentInstallationId) {
      return NextResponse.json(
        { success: false, error: "Guardia no tiene instalación asignada" },
        { status: 400 },
      );
    }

    const installationId = guardia.currentInstallationId;

    const [sections, latestVersion, globalDocuments] = await Promise.all([
      prisma.protocolSection.findMany({
        where: { installationId },
        include: {
          items: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              order: true,
              source: true,
            },
          },
        },
        orderBy: { order: "asc" },
      }),
      prisma.protocolVersion.findFirst({
        where: { installationId, status: "published" },
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          publishedAt: true,
        },
      }),
      prisma.protocolDocument.findMany({
        where: { tenantId: guardAuth.tenantId, scope: "global" },
        orderBy: { createdAt: "desc" },
        select: { id: true, fileName: true, fileUrl: true, fileSize: true, createdAt: true },
      }),
    ]);

    const data = {
      installationId,
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        icon: s.icon,
        order: s.order,
        items: s.items,
      })),
      version: latestVersion
        ? {
            id: latestVersion.id,
            versionNumber: latestVersion.versionNumber,
            publishedAt: latestVersion.publishedAt?.toISOString() ?? null,
          }
        : null,
      globalDocuments: globalDocuments.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        fileSize: d.fileSize,
        createdAt: d.createdAt,
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Protocol GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener protocolo" },
      { status: 500 },
    );
  }
}
