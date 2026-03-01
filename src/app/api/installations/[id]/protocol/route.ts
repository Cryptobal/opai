import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver protocolos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const [sections, documents, latestVersion] = await Promise.all([
      prisma.protocolSection.findMany({
        where: { installationId: id },
        include: { items: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      }),
      prisma.protocolDocument.findMany({
        where: { installationId: id },
      }),
      prisma.protocolVersion.findFirst({
        where: { installationId: id },
        orderBy: { versionNumber: "desc" },
      }),
    ]);

    const itemCount = sections.reduce((sum, s) => sum + s.items.length, 0);

    return NextResponse.json({
      success: true,
      data: {
        sections,
        documents,
        latestVersion,
        stats: { sectionCount: sections.length, itemCount },
      },
    });
  } catch (error) {
    console.error("[PROTOCOL] Error fetching protocol:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el protocolo" },
      { status: 500 },
    );
  }
}
