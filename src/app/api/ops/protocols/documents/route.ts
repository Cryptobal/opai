/**
 * API Route: /api/ops/protocols/documents
 * GET - List protocol documents for an installation
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para ver documentos de protocolo" }, { status: 403 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    const documents = await prisma.opsProtocolDocument.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error fetching documents:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documentos" },
      { status: 500 },
    );
  }
}
