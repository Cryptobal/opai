/**
 * API Route: /api/crm/leads/[id]
 * GET   - Obtener prospecto
 * PATCH - Actualizar prospecto
 * DELETE - Eliminar prospecto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { createLeadSchema } from "@/lib/validations/crm";
import { toSentenceCase } from "@/lib/text-format";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;

    const lead = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Prospecto no encontrado" },
        { status: 404 }
      );
    }

    if (!lead.firstViewedAt) {
      try {
        await prisma.crmLead.update({
          where: { id: lead.id },
          data: {
            firstViewedAt: new Date(),
            firstViewedBy: ctx.userId,
          },
        });
      } catch (e) {
        console.warn("Failed to mark lead as viewed", e);
      }
    }

    return NextResponse.json({ success: true, data: lead });
  } catch (error) {
    console.error("Error fetching lead:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch lead" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Prospecto no encontrado" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, createLeadSchema.partial());
    if (parsed.error) return parsed.error;
    const payload = parsed.data;

    const normalizedData = {
      ...payload,
      firstName:
        payload.firstName === undefined
          ? undefined
          : toSentenceCase(payload.firstName) ?? null,
      lastName:
        payload.lastName === undefined
          ? undefined
          : toSentenceCase(payload.lastName) ?? null,
    };

    const result = await prisma.crmLead.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: normalizedData,
    });
    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Prospecto no encontrado" },
        { status: 404 }
      );
    }
    const lead = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    return NextResponse.json({ success: true, data: lead });
  } catch (error) {
    console.error("Error updating lead:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update lead" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Prospecto no encontrado" },
        { status: 404 }
      );
    }

    const DELETABLE_STATUSES = ["new", "pending", "in_review", "rejected"];
    if (!DELETABLE_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: "No se puede eliminar un lead aprobado" },
        { status: 400 }
      );
    }

    // Instalaciones con leadId usan onDelete: SetNull, se desvinculan
    await prisma.crmLead.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting lead:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete lead" },
      { status: 500 }
    );
  }
}
