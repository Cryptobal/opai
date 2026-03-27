/**
 * API Route: /api/crm/pipeline
 * GET  - Listar etapas de pipeline
 * POST - Crear etapa
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const stages = await prisma.crmPipelineStage.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ success: true, data: stages });
  } catch (error) {
    console.error("Error fetching CRM pipeline:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pipeline" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    if (!body?.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre es requerido" },
        { status: 400 }
      );
    }

    const stage = await prisma.crmPipelineStage.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name.trim(),
        order: Number(body.order) || 1,
        color: body?.color || null,
        isActive: true,
        isClosedWon: Boolean(body?.isClosedWon),
        isClosedLost: Boolean(body?.isClosedLost),
        isAccepted: Boolean(body?.isAccepted),
      },
    });

    return NextResponse.json({ success: true, data: stage }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM pipeline stage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create stage" },
      { status: 500 }
    );
  }
}
