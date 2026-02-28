/**
 * API Route: /api/ops/protocols/pdf
 * GET - Generate PDF of the full protocol for an installation
 *
 * Query: ?installationId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { ProtocolPDF } from "@/components/pdf/ProtocolPDF";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Anyone with ops view can download the protocol PDF
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para descargar protocolo" },
        { status: 403 },
      );
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    // Get latest published version
    const version = await prisma.opsProtocolVersion.findFirst({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        status: "published",
      },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true, publishedAt: true },
    });

    // Get protocol sections with items
    const sections = await prisma.opsProtocolSection.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      include: {
        items: { orderBy: { order: "asc" } },
      },
      orderBy: { order: "asc" },
    });

    if (sections.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay secciones de protocolo para exportar" },
        { status: 400 },
      );
    }

    const pdfBuffer = await renderToBuffer(
      ProtocolPDF({
        installationName: installation.name,
        version: version?.versionNumber ?? null,
        publishedAt: version?.publishedAt?.toISOString() ?? null,
        sections: sections.map((s: typeof sections[number]) => ({
          title: s.title,
          icon: s.icon,
          items: s.items.map((i: typeof s.items[number]) => ({
            title: i.title,
            description: i.description,
          })),
        })),
      }),
    );

    const safeInstName = installation.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "").replace(/\s+/g, "_");
    const fileName = `Protocolo_${safeInstName}${version ? `_v${version.versionNumber}` : ""}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error generating protocol PDF:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar PDF del protocolo" },
      { status: 500 },
    );
  }
}
