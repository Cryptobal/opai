import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const listType = new URL(request.url).searchParams.get("listType");
    const where = {
      tenantId: authCtx.tenantId,
      isActive: true,
      ...(listType ? { listType } : {}),
      installationLinks: {
        some: { installationId },
      },
    };

    const [groups, installations] = await Promise.all([
      safeAccessControlQuery(
        () =>
          prisma.accessControlListGroup.findMany({
            where,
            orderBy: [{ listType: "asc" }, { name: "asc" }],
            include: {
              installationLinks: {
                include: {
                  installation: {
                    select: { id: true, name: true },
                  },
                },
              },
              _count: {
                select: { memberLinks: true, installationLinks: true },
              },
            },
          }),
        [],
      ),
      safeAccessControlQuery(
        () =>
          prisma.crmInstallation.findMany({
            where: { tenantId: authCtx.tenantId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        [],
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        groups: groups ?? [],
        installations: installations ?? [],
      },
    });
  } catch (error) {
    console.error("[AccessControl] Error fetching list groups:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener grupos" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = (await request.json()) as {
      listType?: "whitelist" | "blacklist";
      name?: string;
      description?: string;
      installationIds?: string[];
      entryIds?: string[];
    };
    const listType = body.listType;
    const name = (body.name ?? "").trim();
    if (!listType || !["whitelist", "blacklist"].includes(listType)) {
      return NextResponse.json({ success: false, error: "listType inválido" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });
    }

    const requestedInstallationIds =
      Array.isArray(body.installationIds) && body.installationIds.length > 0
        ? Array.from(new Set(body.installationIds))
        : [installationId];
    const validInstallations = await prisma.crmInstallation.findMany({
      where: {
        tenantId: authCtx.tenantId,
        id: { in: requestedInstallationIds },
      },
      select: { id: true },
    });
    const validInstallationIds = validInstallations.map((i) => i.id);
    if (validInstallationIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Debes seleccionar al menos una instalación válida" },
        { status: 400 },
      );
    }

    const entryIds = Array.isArray(body.entryIds) ? body.entryIds : [];

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.accessControlListGroup.create({
        data: {
          tenantId: authCtx.tenantId,
          listType,
          name,
          description: body.description?.trim() || null,
          installationLinks: {
            create: validInstallationIds.map((id) => ({ installationId: id })),
          },
        },
      });

      if (entryIds.length > 0) {
        const validEntries = await tx.accessControlList.findMany({
          where: {
            tenantId: authCtx.tenantId,
            id: { in: entryIds },
            listType,
          },
          select: { id: true },
        });
        if (validEntries.length > 0) {
          await tx.accessControlListGroupMember.createMany({
            data: validEntries.map((e) => ({ groupId: group.id, listEntryId: e.id })),
            skipDuplicates: true,
          });
        }
      }

      return group;
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[AccessControl] Error creating list group:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear grupo" },
      { status: 500 },
    );
  }
}
