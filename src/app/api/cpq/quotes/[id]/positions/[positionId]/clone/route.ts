/**
 * API Route: /api/cpq/quotes/[id]/positions/[positionId]/clone
 * POST - Clone a position with all its data
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; positionId: string }> }
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const { id: quoteId, positionId } = await params;
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const tenantId = session.user.tenantId;

    // Verify quote belongs to tenant
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId },
    });
    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }

    // Get original position
    const original = await prisma.cpqPosition.findFirst({
      where: { id: positionId, quoteId },
    });
    if (!original) {
      return NextResponse.json(
        { success: false, error: "Position not found" },
        { status: 404 }
      );
    }

    // Clone the position (Prisma JSON fields need JsonNull for null, not literal null)
    // customName: null para que el título se derive de cargo + puestoTrabajo (sin sufijo "copia")
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...posData } = original;
    const cloned = await prisma.cpqPosition.create({
      data: {
        ...posData,
        customName: null,
        payrollSnapshot:
          posData.payrollSnapshot === null
            ? Prisma.JsonNull
            : posData.payrollSnapshot,
      },
      include: {
        puestoTrabajo: true,
        cargo: true,
        rol: true,
      },
    });

    await createCrmHistoryLog({
      tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_position_cloned",
      details: {
        quoteCode: quote.code,
        sourcePositionId: positionId,
        clonedPositionId: cloned.id,
      },
      createdBy: session?.user?.id ?? null,
    });

    return NextResponse.json({ success: true, data: cloned }, { status: 201 });
  } catch (error) {
    console.error("Error cloning position:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clone position" },
      { status: 500 }
    );
  }
}
