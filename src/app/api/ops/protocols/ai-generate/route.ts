/**
 * API Route: /api/ops/protocols/ai-generate
 * POST - Generate full protocol from installation type using AI
 *
 * Body: { installationId, installationType, additionalContext? }
 * Creates sections + items in the database, returns them.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { generateProtocolFromType } from "@/lib/protocol-ai";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const { installationId, installationType, additionalContext } = body;

    if (!installationId || !installationType) {
      return NextResponse.json(
        { success: false, error: "installationId e installationType son requeridos" },
        { status: 400 },
      );
    }

    // Verify installation belongs to tenant
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    // Generate protocol with AI
    const result = await generateProtocolFromType(installationType, additionalContext);

    // Persist sections + items in a transaction
    const sections = await prisma.$transaction(
      result.sections.map((section, sIdx) =>
        prisma.opsProtocolSection.create({
          data: {
            tenantId: ctx.tenantId,
            installationId,
            title: section.title,
            icon: section.icon,
            order: sIdx,
            items: {
              create: section.items.map((item, iIdx) => ({
                tenantId: ctx.tenantId,
                title: item.title,
                description: item.description,
                order: iIdx,
                source: "ai_generated",
                createdBy: ctx.userId,
              })),
            },
          },
          include: { items: { orderBy: { order: "asc" } } },
        }),
      ),
    );

    return NextResponse.json({ success: true, data: sections }, { status: 201 });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error AI generating protocol:", error);
    const msg = error instanceof Error ? error.message : "Error al generar protocolo con IA";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}
