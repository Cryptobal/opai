import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 }
      );
    }

    if (!session.installations.some((i) => i.id === installationId)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    // Get published protocol versions for this installation
    const versions = await prisma.protocolVersion.findMany({
      where: {
        installationId,
        status: { in: ["published", "active"] },
      },
      orderBy: { publishedAt: "desc" },
      take: 5,
      select: {
        id: true,
        versionNumber: true,
        status: true,
        publishedAt: true,
        snapshot: true,
      },
    });

    // Also get current sections directly (only portal-visible ones)
    const sections = await prisma.protocolSection.findMany({
      where: { installationId, portalVisible: true },
      orderBy: { order: "asc" },
      include: {
        items: {
          orderBy: { order: "asc" },
          select: { id: true, title: true, description: true },
        },
      },
    });

    // Build protocol data from sections (current state)
    const protocols = [];

    if (sections.length > 0) {
      const latestVersion = versions[0];

      // Fetch latest acceptance for this contact against the current version
      let lastAcceptance: {
        id: string;
        acceptedAt: string;
        firmanteNombre: string;
        versionNumber: number;
      } | null = null;
      let requiresSignature = true;

      if (latestVersion) {
        try {
          const acc = await prisma.protocolAcceptance.findFirst({
            where: {
              contactId: session.contactId,
              installationId,
              protocolVersionId: latestVersion.id,
            },
            orderBy: { acceptedAt: "desc" },
            select: {
              id: true,
              acceptedAt: true,
              firmanteNombre: true,
              versionNumber: true,
            },
          });
          if (acc) {
            lastAcceptance = {
              id: acc.id,
              acceptedAt: acc.acceptedAt.toISOString(),
              firmanteNombre: acc.firmanteNombre,
              versionNumber: acc.versionNumber,
            };
            requiresSignature = acc.versionNumber < latestVersion.versionNumber;
          }
        } catch {
          // Table may not exist yet in some environments
        }
      }

      protocols.push({
        id: latestVersion?.id ?? `current-${installationId}`,
        title: "Protocolo de Seguridad",
        version: latestVersion ? `v${latestVersion.versionNumber}` : "v1.0",
        updatedAt: latestVersion?.publishedAt?.toISOString() ?? new Date().toISOString(),
        status: "active",
        lastAcceptance,
        requiresSignature: !!latestVersion && requiresSignature,
        sections: sections.map((s) => ({
          title: s.title,
          items: s.items.map((item) => item.title),
        })),
      });
    }

    return NextResponse.json({ success: true, data: protocols });
  } catch (error) {
    console.error("[Portal Cliente] protocolos", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
