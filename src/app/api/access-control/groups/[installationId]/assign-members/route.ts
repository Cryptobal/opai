import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

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
      groupIds?: string[];
      entryIds?: string[];
      listType?: "whitelist" | "blacklist";
    };
    const groupIds = Array.isArray(body.groupIds) ? Array.from(new Set(body.groupIds)) : [];
    const entryIds = Array.isArray(body.entryIds) ? Array.from(new Set(body.entryIds)) : [];
    const listType = body.listType;

    if (groupIds.length === 0 || entryIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Debes seleccionar al menos un grupo y una persona" },
        { status: 400 },
      );
    }

    const [groups, entries] = await Promise.all([
      prisma.accessControlListGroup.findMany({
        where: {
          id: { in: groupIds },
          tenantId: authCtx.tenantId,
          isActive: true,
          ...(listType ? { listType } : {}),
          installationLinks: { some: { installationId } },
        },
        select: { id: true },
      }),
      prisma.accessControlList.findMany({
        where: {
          id: { in: entryIds },
          tenantId: authCtx.tenantId,
          ...(listType ? { listType } : {}),
        },
        select: { id: true },
      }),
    ]);

    const validGroupIds = groups.map((g) => g.id);
    const validEntryIds = entries.map((e) => e.id);
    if (validGroupIds.length === 0 || validEntryIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay grupos/personas válidos para asignar" },
        { status: 400 },
      );
    }

    const rows: Array<{ groupId: string; listEntryId: string }> = [];
    for (const groupId of validGroupIds) {
      for (const listEntryId of validEntryIds) {
        rows.push({ groupId, listEntryId });
      }
    }

    const result = await prisma.accessControlListGroupMember.createMany({
      data: rows,
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        assigned: result.count,
        groups: validGroupIds.length,
        members: validEntryIds.length,
      },
    });
  } catch (error) {
    console.error("[AccessControl] Error assigning members to groups:", error);
    return NextResponse.json(
      { success: false, error: "Error al asignar personas a grupos" },
      { status: 500 },
    );
  }
}
