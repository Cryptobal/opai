import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { z } from "zod";

const bulkResolveSchema = z.object({
  tipos: z.array(z.string()).min(1),
  installationId: z.string().uuid().optional(),
  resolutionNotes: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rondas_resolve_alerts")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para resolver alertas" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, bulkResolveSchema);
    if (parsed.error) return parsed.error;

    const { tipos, installationId, resolutionNotes } = parsed.data;

    const result = await prisma.opsAlertaRonda.updateMany({
      where: {
        tenantId: ctx.tenantId,
        resuelta: false,
        tipo: { in: tipos },
        ...(installationId ? { installationId } : {}),
      },
      data: {
        resuelta: true,
        resueltaPor: ctx.userId,
        resueltaAt: new Date(),
        resolutionNotes: resolutionNotes ?? "Resuelto en lote desde monitoreo",
      },
    });

    return NextResponse.json({
      success: true,
      data: { resolved: result.count },
    });
  } catch (error) {
    console.error("[RONDAS] POST bulk-resolve alertas", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
