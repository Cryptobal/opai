/**
 * POST /api/crm/leads/[id]/reopen
 * Reabre un lead rechazado → pending. Usa el permiso de edición de leads.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;
    const lead = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!lead) {
      return NextResponse.json({ success: false, error: "Prospecto no encontrado" }, { status: 404 });
    }
    if (lead.status !== "rejected") {
      return NextResponse.json(
        { success: false, error: "Solo se puede reabrir un lead rechazado." },
        { status: 400 },
      );
    }

    const prevMeta =
      lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
        ? { ...(lead.metadata as Record<string, unknown>) }
        : {};
    const prevRejection =
      prevMeta.rejection && typeof prevMeta.rejection === "object" && !Array.isArray(prevMeta.rejection)
        ? { ...(prevMeta.rejection as Record<string, unknown>) }
        : {};

    const updated = await prisma.crmLead.update({
      where: { id: lead.id },
      data: {
        status: "pending",
        metadata: {
          ...prevMeta,
          rejection: {
            ...prevRejection,
            reopenedAt: new Date().toISOString(),
            reopenedBy: ctx.userId,
          },
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "lead",
        entityId: lead.id,
        action: "lead_reopened",
        details: { previousStatus: "rejected" },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error reopening CRM lead:", error);
    return NextResponse.json({ success: false, error: "No se pudo reabrir el lead" }, { status: 500 });
  }
}
