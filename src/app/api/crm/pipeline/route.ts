/**
 * API Route: /api/crm/pipeline
 * GET  - Listar etapas de pipeline
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const stages = await prisma.crmPipelineStage.findMany({
      where: { tenantId, isActive: true },
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    if (!body?.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre es requerido" },
        { status: 400 }
      );
    }

    const stage = await prisma.crmPipelineStage.create({
      data: {
        tenantId,
        name: body.name.trim(),
        order: Number(body.order) || 1,
        color: body?.color || null,
        isActive: true,
        isClosedWon: Boolean(body?.isClosedWon),
        isClosedLost: Boolean(body?.isClosedLost),
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
