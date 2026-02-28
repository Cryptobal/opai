import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView } from "@/lib/permissions";

type Params = { installationId: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { installationId } = await params;
    const sp = request.nextUrl.searchParams;
    const statusFilter = sp.get("status") ?? "open";

    const findings = await prisma.opsSupervisionFinding.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        ...(statusFilter === "all"
          ? {}
          : statusFilter === "open"
            ? { status: { in: ["open", "in_progress"] } }
            : { status: statusFilter }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: findings });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching installation findings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los hallazgos" },
      { status: 500 },
    );
  }
}

const updateFindingSchema = z.object({
  findingId: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "verified"]),
  verifiedInVisitId: z.string().uuid().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { installationId } = await params;
    const bodyRaw = await request.json();
    const parsed = updateFindingSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const finding = await prisma.opsSupervisionFinding.findFirst({
      where: {
        id: parsed.data.findingId,
        tenantId: ctx.tenantId,
        installationId,
      },
    });

    if (!finding) {
      return NextResponse.json(
        { success: false, error: "Hallazgo no encontrado" },
        { status: 404 },
      );
    }

    const updated = await prisma.opsSupervisionFinding.update({
      where: { id: parsed.data.findingId },
      data: {
        status: parsed.data.status,
        ...(parsed.data.status === "resolved" ? { resolvedAt: new Date() } : {}),
        ...(parsed.data.status === "verified" && parsed.data.verifiedInVisitId
          ? { verifiedInVisitId: parsed.data.verifiedInVisitId, resolvedAt: new Date() }
          : {}),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error updating finding:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el hallazgo" },
      { status: 500 },
    );
  }
}
