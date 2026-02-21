import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

/* ── GET /api/finance/pending-billable-items ──────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (accountId) where.accountId = accountId;
    if (status) where.status = status;

    const items = await prisma.financePendingBillableItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[FINANCE] Error listing pending billable items:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los items pendientes" },
      { status: 500 },
    );
  }
}
