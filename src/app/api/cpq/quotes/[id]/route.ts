/**
 * API Route: /api/cpq/quotes/[id]
 * GET    - Detalle de cotización
 * PATCH  - Actualizar cotización
 * DELETE - Eliminar cotización
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit, requireCpqDelete } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";
import { computeChangedFields, createCrmHistoryLog } from "@/lib/crm-history";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;
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
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;
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
    // Commercial conditions
    if (body.paymentTerms !== undefined) updateData.paymentTerms = body.paymentTerms || "contrafactura";
    if (body.serviceStartDays !== undefined) updateData.serviceStartDays = Number(body.serviceStartDays) || 5;
    if (body.contractDuration !== undefined) updateData.contractDuration = Number(body.contractDuration) || 12;
    if (body.includedItems !== undefined) updateData.includedItems = { set: Array.isArray(body.includedItems) ? body.includedItems : [] };
    if (body.proposalTemplateId !== undefined) updateData.proposalTemplateId = body.proposalTemplateId || null;

    // Verify ownership and fetch existing for audit diff
    const existing = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        name: true,
        clientName: true,
        validUntil: true,
        notes: true,
        accountId: true,
        contactId: true,
        dealId: true,
        installationId: true,
        currency: true,
        aiDescription: true,
        serviceDetail: true,
        paymentTerms: true,
        serviceStartDays: true,
        contractDuration: true,
        includedItems: true,
        proposalTemplateId: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }

    const quote = await prisma.cpqQuote.update({
      where: { id },
      data: updateData,
    });

    // Audit log: quote_updated with changed fields
    if (Object.keys(updateData).length > 0) {
      const patch: Record<string, unknown> = { ...existing };
      for (const [k, v] of Object.entries(updateData)) {
        patch[k] = v;
      }
      const diff = computeChangedFields(
        existing as unknown as Record<string, unknown>,
        patch
      );
      if (diff.changedFields.length > 0) {
        await createCrmHistoryLog({
          tenantId: ctx.tenantId,
          entityType: "quote",
          entityId: id,
          action: "quote_updated",
          details: {
            changedFields: diff.changedFields,
            changes: diff.changes,
            quoteCode: quote.code,
          },
          createdBy: ctx.userId,
        });
      }
    }

    // Push: quote accepted or rejected
    if (body.status === 'accepted' || body.status === 'rejected') {
      try {
        const { sendPushToAdmins } = await import('@/lib/pwa/push-service');
        const notifKey = body.status === 'accepted' ? 'quote_accepted' : 'quote_rejected';
        const statusLabel = body.status === 'accepted' ? 'aceptada' : 'rechazada';
        await sendPushToAdmins(
          ctx.tenantId,
          notifKey,
          `Cotización ${statusLabel}`,
          `La cotización "${quote?.name || quote?.clientName || quote?.id}" fue ${statusLabel}`,
          `/opai/cpq/cotizaciones/${id}`,
        );
      } catch (err) {
        console.error('[CPQ] Error sending quote status push:', err);
      }
    }

    return NextResponse.json({ success: true, data: quote });
  } catch (error) {
    console.error("Error updating CPQ quote:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Failed to update quote: ${msg}` },
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
    const forbidden = await requireCpqDelete(ctx);
    if (forbidden) return forbidden;
    const tenantId = ctx.tenantId;

    const existing = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      select: { id: true, code: true, name: true, clientName: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }

    await prisma.cpqQuote.delete({ where: { id } });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_deleted",
      details: {
        code: existing.code,
        name: existing.name ?? existing.clientName,
      },
      createdBy: ctx.userId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CPQ quote:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete quote" },
      { status: 500 }
    );
  }
}
