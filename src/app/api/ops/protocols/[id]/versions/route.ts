/**
 * API Route: /api/ops/protocols/[id]/versions
 * GET - List all protocol versions for an installation
 *
 * [id] here is the installationId for consistency with the protocol routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para ver protocolos" }, { status: 403 });
    }

    const { id: installationId } = await params;

    const versions = await prisma.opsProtocolVersion.findMany({
      where: { tenantId: ctx.tenantId, installationId },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        publishedAt: true,
        publishedBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: versions });
  } catch (error) {
    console.error("[OPS][PROTOCOL] Error fetching versions:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener versiones" },
      { status: 500 },
    );
  }
}
