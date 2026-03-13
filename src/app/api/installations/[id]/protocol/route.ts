import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canViewInstallations, canEditInstallations } from "@/lib/permissions";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canViewInstallations(perms)) {
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEditInstallations(perms)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para editar protocolos" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      sections?: Array<{
        title?: unknown;
        icon?: unknown;
        order?: unknown;
        items?: Array<{ title?: unknown; description?: unknown; order?: unknown; source?: unknown }>;
      }>;
    };

    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se requiere un array de secciones" },
        { status: 400 },
      );
    }

    // Determine starting order (append after existing sections)
    const lastSection = await prisma.protocolSection.findFirst({
      where: { installationId: id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    let baseOrder = (lastSection?.order ?? -1) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const sec of body.sections!) {
        const title = typeof sec.title === "string" ? sec.title.trim() : "";
        if (!title) continue;

        const section = await tx.protocolSection.create({
          data: {
            installationId: id,
            title,
            icon: typeof sec.icon === "string" ? sec.icon : "📋",
            order: typeof sec.order === "number" ? sec.order : baseOrder++,
          },
        });

        if (Array.isArray(sec.items)) {
          for (let i = 0; i < sec.items.length; i++) {
            const item = sec.items[i];
            const itemTitle = typeof item.title === "string" ? item.title.trim() : "";
            if (!itemTitle) continue;
            await tx.protocolItem.create({
              data: {
                sectionId: section.id,
                title: itemTitle,
                description: typeof item.description === "string" ? item.description : "",
                order: typeof item.order === "number" ? item.order : i,
                source: typeof item.source === "string" ? item.source : undefined,
              },
            });
          }
        }

        results.push(section);
      }
      return results;
    });

    return NextResponse.json({ success: true, data: { created: created.length } }, { status: 201 });
  } catch (error) {
    console.error("[PROTOCOL] Error bulk-saving protocol:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo guardar el protocolo" },
      { status: 500 },
    );
  }
}
