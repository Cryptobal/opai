/**
 * API Route: /api/ops/protocols
 * GET  - List protocols (sections + items) for an installation
 * POST - Create a new protocol section
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    const sections = await prisma.opsProtocolSection.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      include: { items: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ success: true, data: sections });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error fetching protocol:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener protocolo" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const { installationId, title, icon, order } = body;

    if (!installationId || !title) {
      return NextResponse.json(
        { success: false, error: "installationId y title son requeridos" },
        { status: 400 },
      );
    }

    const section = await prisma.opsProtocolSection.create({
      data: {
        tenantId: ctx.tenantId,
        installationId,
        title,
        icon: icon ?? null,
        order: order ?? 0,
      },
    });

    return NextResponse.json({ success: true, data: section }, { status: 201 });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error creating section:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear sección" },
      { status: 500 },
    );
  }
}
