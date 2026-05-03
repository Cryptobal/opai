import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

type Params = { id: string };

/**
 * GET /api/ops/tickets/[id]/csat — admin: lee el rating + comment + token
 * para mostrarlo en el detalle. Multi-tenant.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const t = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        csatToken: true,
        csatTokenExp: true,
        csat: {
          select: {
            rating: true,
            comment: true,
            submittedAt: true,
          },
        },
      },
    });
    if (!t) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        token: t.csatToken,
        tokenExp:
          t.csatTokenExp instanceof Date
            ? t.csatTokenExp.toISOString()
            : t.csatTokenExp,
        rating: t.csat?.rating ?? null,
        comment: t.csat?.comment ?? null,
        submittedAt:
          t.csat?.submittedAt instanceof Date
            ? t.csat.submittedAt.toISOString()
            : (t.csat?.submittedAt ?? null),
      },
    });
  } catch (err) {
    console.error("[OPS] csat GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}
