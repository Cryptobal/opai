import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para publicar protocolos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const sections = await prisma.protocolSection.findMany({
      where: { installationId: id },
      include: { items: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    });

    if (sections.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay secciones para publicar" },
        { status: 400 },
      );
    }

    const latest = await prisma.protocolVersion.findFirst({
      where: { installationId: id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    const nextVersion = (latest?.versionNumber ?? 0) + 1;

    const version = await prisma.protocolVersion.create({
      data: {
        installationId: id,
        versionNumber: nextVersion,
        status: "published",
        snapshot: JSON.parse(JSON.stringify(sections)),
        publishedAt: new Date(),
        publishedBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: version }, { status: 201 });
  } catch (error) {
    console.error("[PROTOCOL] Error publishing protocol:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo publicar el protocolo" },
      { status: 500 },
    );
  }
}
