/**
 * API Route: /api/ops/protocols/[id]
 * GET    - Get a single protocol section with items
 * PATCH  - Update protocol section (title, icon, order)
 * DELETE - Delete protocol section and its items
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const section = await prisma.opsProtocolSection.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { items: { orderBy: { order: "asc" } } },
    });

    if (!section) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: section });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error fetching section:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener sección" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const existing = await prisma.opsProtocolSection.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.icon !== undefined) data.icon = body.icon;
    if (body.order !== undefined) data.order = body.order;

    const section = await prisma.opsProtocolSection.update({
      where: { id },
      data,
      include: { items: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ success: true, data: section });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error updating section:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar sección" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const existing = await prisma.opsProtocolSection.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Sección no encontrada" },
        { status: 404 },
      );
    }

    await prisma.opsProtocolSection.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error deleting section:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar sección" },
      { status: 500 },
    );
  }
}
