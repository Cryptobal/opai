/**
 * API Route: /api/ops/protocols/ai-section
 * POST - Generate a full protocol section with AI
 *
 * Body: { installationId, description }
 * Returns the AI-generated section (title, icon, items) without saving.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { generateProtocolSection } from "@/lib/protocol-ai";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const { installationId, description } = body;

    if (!installationId || !description) {
      return NextResponse.json(
        { success: false, error: "installationId y description son requeridos" },
        { status: 400 },
      );
    }

    // Fetch existing section titles
    const existingSections = await prisma.opsProtocolSection.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      select: { title: true },
    });

    const result = await generateProtocolSection(
      description,
      existingSections.map((s) => s.title),
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error AI generating section:", error);
    const msg = error instanceof Error ? error.message : "Error al generar sección con IA";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}
