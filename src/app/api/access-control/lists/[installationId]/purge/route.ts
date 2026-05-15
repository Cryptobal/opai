import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";
import { ACCESS_CONTROL_LIST_PURGE_CONFIRMATION } from "@/lib/access-control/list-purge-constants";

/**
 * Elimina masivamente entradas de lista blanca/negra para esta instalación.
 * Lista negra global (scope global, sin installation_id) solo se borra si el cliente lo pide explícitamente.
 */
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
      confirmation?: string;
      deleteGlobalBlacklist?: boolean;
    };

    const listType = body.listType;
    if (!listType || !["whitelist", "blacklist"].includes(listType)) {
      return NextResponse.json({ success: false, error: "listType inválido" }, { status: 400 });
    }
    if (body.confirmation !== ACCESS_CONTROL_LIST_PURGE_CONFIRMATION) {
      return NextResponse.json(
        {
          success: false,
          error: `Confirma escribiendo exactamente: ${ACCESS_CONTROL_LIST_PURGE_CONFIRMATION}`,
        },
        { status: 400 },
      );
    }

    const tenantId = authCtx.tenantId;

    const localWhere: Prisma.AccessControlListWhereInput = {
      tenantId,
      listType,
      installationId,
    };

    let where: Prisma.AccessControlListWhereInput = localWhere;

    if (listType === "blacklist" && body.deleteGlobalBlacklist === true) {
      where = {
        tenantId,
        listType: "blacklist",
        OR: [{ installationId }, { scope: "global", installationId: null }],
      };
    }

    const result = await prisma.accessControlList.deleteMany({ where });

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.count,
        listType,
        includedGlobalBlacklist: listType === "blacklist" && body.deleteGlobalBlacklist === true,
      },
    });
  } catch (error) {
    console.error("[AccessControl] Error purging list:", error);
    return NextResponse.json(
      { success: false, error: "Error al vaciar la lista" },
      { status: 500 },
    );
  }
}
