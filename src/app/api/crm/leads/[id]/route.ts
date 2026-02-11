/**
 * API Route: /api/crm/leads/[id]
 * GET   - Obtener prospecto
 * PATCH - Actualizar prospecto
 * DELETE - Eliminar prospecto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { createLeadSchema } from "@/lib/validations/crm";
import { toSentenceCase } from "@/lib/text-format";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

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

    const lead = await prisma.crmLead.update({
      where: { id },
      data: normalizedData,
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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

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
