/**
 * API Route: /api/cpq/quotes/[id]
 * GET    - Detalle de cotización
 * PATCH  - Actualizar cotización
 * DELETE - Eliminar cotización
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;
    const tenantId = ctx.tenantId;

    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      include: {
        positions: {
          include: {
            puestoTrabajo: true,
            cargo: true,
            rol: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: quote });
  } catch (error) {
    console.error("Error fetching CPQ quote:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch quote" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;
    const tenantId = ctx.tenantId;
    const body = await request.json();

    // Build update data - only include fields that are present in the body
    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.name !== undefined) updateData.name = body.name?.trim() || null;
    if (body.clientName !== undefined) updateData.clientName = body.clientName?.trim() || null;
    if (body.validUntil !== undefined) updateData.validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;
    // CRM context fields
    if (body.accountId !== undefined) updateData.accountId = body.accountId || null;
    if (body.contactId !== undefined) updateData.contactId = body.contactId || null;
    if (body.dealId !== undefined) updateData.dealId = body.dealId || null;
    if (body.installationId !== undefined) updateData.installationId = body.installationId || null;
    if (body.currency !== undefined) updateData.currency = body.currency || "CLP";
    if (body.aiDescription !== undefined) updateData.aiDescription = body.aiDescription || null;
    if (body.serviceDetail !== undefined) updateData.serviceDetail = body.serviceDetail || null;

    const updated = await prisma.cpqQuote.updateMany({
      where: { id, tenantId },
      data: updateData,
    });

    if (!updated.count) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }

    const quote = await prisma.cpqQuote.findUnique({ where: { id } });
    return NextResponse.json({ success: true, data: quote });
  } catch (error) {
    console.error("Error updating CPQ quote:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update quote" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;
    const tenantId = ctx.tenantId;

    const existing = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }

    await prisma.cpqQuote.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CPQ quote:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete quote" },
      { status: 500 }
    );
  }
}
