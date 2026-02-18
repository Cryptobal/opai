import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getPermissionsFromAuth } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";

/**
 * GET /api/crm/installations/[id]/guardias
 * Returns guards available for assignment (contratado, not blacklisted).
 * Used by the assignment modal in the installation detail page.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await getPermissionsFromAuth(ctx);
    if (!canView(perms, "crm", "dotacion")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver dotación" },
        { status: 403 }
      );
    }

    await params;

    const guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        lifecycleStatus: "contratado",
        isBlacklisted: false,
      },
      select: {
        id: true,
        code: true,
        lifecycleStatus: true,
        persona: {
          select: { firstName: true, lastName: true, rut: true },
        },
      },
      orderBy: { persona: { lastName: "asc" } },
    });

    return NextResponse.json({ success: true, data: guardias });
  } catch (error) {
    console.error("[CRM] Error listing guardias:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los guardias" },
      { status: 500 }
    );
  }
}
