/**
 * API Route: /api/crm/deals/[id]
 * GET   - Obtener negocio
 * PATCH - Actualizar negocio
 * DELETE - Eliminar negocio
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { createDealSchema } from "@/lib/validations/crm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const deal = await prisma.crmDeal.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
        stage: true,
        primaryContact: true,
      },
    });

    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: deal });
  } catch (error) {
    console.error("Error fetching deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch deal" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const existing = await prisma.crmDeal.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, createDealSchema.partial());
    if (parsed.error) return parsed.error;

    const raw = parsed.data as Record<string, unknown>;
    const data = { ...raw };
    if (data.expectedCloseDate)
      data.expectedCloseDate = new Date(data.expectedCloseDate as string);

    if ("activeQuotationId" in raw) {
      const nextActiveQuotationId = raw.activeQuotationId as string | null | undefined;
      if (nextActiveQuotationId) {
        const [quoteLink, sentQuote] = await Promise.all([
          prisma.crmDealQuote.findFirst({
            where: {
              tenantId: ctx.tenantId,
              dealId: id,
              quoteId: nextActiveQuotationId,
            },
            select: { id: true },
          }),
          prisma.cpqQuote.findFirst({
            where: {
              tenantId: ctx.tenantId,
              id: nextActiveQuotationId,
              status: "sent",
            },
            select: { id: true },
          }),
        ]);

        if (!quoteLink || !sentQuote) {
          return NextResponse.json(
            {
              success: false,
              error:
                "La cotización activa debe estar vinculada al negocio y en estado enviada.",
            },
            { status: 400 }
          );
        }
      }

      data.activeQuotationId = nextActiveQuotationId ?? null;
    }

    const deal = await prisma.crmDeal.update({
      where: { id },
      data,
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
        stage: true,
        primaryContact: true,
      },
    });

    return NextResponse.json({ success: true, data: deal });
  } catch (error) {
    console.error("Error updating deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update deal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const existing = await prisma.crmDeal.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    // Cascade: stageHistory, dealQuotes, tasks se eliminan por onDelete: Cascade
    await prisma.crmDeal.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete deal" },
      { status: 500 }
    );
  }
}
