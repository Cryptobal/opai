/**
 * API Route: /api/ops/protocols/publish
 * POST - Publish current protocol as a new version
 *
 * Body: { installationId }
 * Takes a JSON snapshot of all sections + items, creates a ProtocolVersion.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const { installationId } = body;

    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    // Build snapshot
    const sections = await prisma.opsProtocolSection.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      include: { items: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    });

    if (sections.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay secciones para publicar" },
        { status: 400 },
      );
    }

    // Determine next version number
    const lastVersion = await prisma.opsProtocolVersion.findFirst({
      where: { tenantId: ctx.tenantId, installationId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

    // Archive any existing published version
    await prisma.opsProtocolVersion.updateMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        status: "published",
      },
      data: { status: "archived" },
    });

    // Create new version
    const version = await prisma.opsProtocolVersion.create({
      data: {
        tenantId: ctx.tenantId,
        installationId,
        versionNumber: nextVersion,
        status: "published",
        snapshot: sections as unknown as Record<string, unknown>[],
        publishedAt: new Date(),
        publishedBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: version }, { status: 201 });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error publishing protocol:", error);
    return NextResponse.json(
      { success: false, error: "Error al publicar protocolo" },
      { status: 500 },
    );
  }
}
