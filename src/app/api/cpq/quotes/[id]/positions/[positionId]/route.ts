/**
 * API Route: /api/cpq/quotes/[id]/positions/[positionId]
 * PATCH  - Actualizar puesto y recalcular costos
 * DELETE - Eliminar puesto
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqDelete } from "@/lib/api-auth-cpq";
import { deleteQuotePosition, patchQuotePosition } from "@/modules/cpq/quote-position-write.service";
import { requireTenantModule } from '@/lib/require-module';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; positionId: string }> },
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id, positionId } = await params;
    const body = await request.json();

    try {
      const position = await patchQuotePosition({
        quoteId: id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        positionId,
        body,
      });
      return NextResponse.json({ success: true, data: position });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "POSITION_NOT_FOUND") {
        return NextResponse.json(
          { success: false, error: "Position not found" },
          { status: 404 },
        );
      }
      if (msg === "WEEKDAYS_INVALID") {
        return NextResponse.json(
          { success: false, error: "weekdays must contain at least one valid day" },
          { status: 400 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("Error updating CPQ position:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update position" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; positionId: string }> },
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqDelete(ctx);
    if (forbidden) return forbidden;

    const { id, positionId } = await params;
    try {
      await deleteQuotePosition({
        quoteId: id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        positionId,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "POSITION_NOT_FOUND") {
        return NextResponse.json(
          { success: false, error: "Position not found" },
          { status: 404 },
        );
      }
      throw e;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CPQ position:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete position" },
      { status: 500 },
    );
  }
}
