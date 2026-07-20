import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID = new Set(["PENDING", "DONE", "DISMISSED"]);

/**
 * PATCH /api/crm/radar/[id] { status } — marca un RadarItem del usuario como
 * DONE / DISMISSED (o de vuelta a PENDING). Tenant + user scoped.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { status?: unknown };
  const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
  if (!VALID.has(status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const res = await prisma.crmRadarItem.updateMany({
    where: { id, tenantId: ctx.tenantId, userId: ctx.userId },
    data: { status },
  });
  if (res.count === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, id, status });
}
