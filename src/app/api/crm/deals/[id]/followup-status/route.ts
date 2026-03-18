/**
 * API Route: /api/crm/deals/[id]/followup-status
 * GET - Lightweight check for active follow-ups on a deal
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;

    const deal = await prisma.crmDeal.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    const pendingCount = await prisma.crmFollowUpLog.count({
      where: { dealId: id, status: "pending" },
    });

    return NextResponse.json({
      success: true,
      data: {
        hasActiveFollowUps: pendingCount > 0,
        pendingCount,
      },
    });
  } catch (error) {
    console.error("Error fetching followup status:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener estado de seguimientos" },
      { status: 500 }
    );
  }
}
