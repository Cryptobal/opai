import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { requireTenantModule } from "@/lib/require-module";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ats");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { jobId } = await params;

    const job = await prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId: ctx.tenantId },
      select: { id: true, estado: true },
    });

    if (!job) {
      return NextResponse.json({ success: false, error: "Aviso no encontrado" }, { status: 404 });
    }
    if (job.estado !== "ACTIVO") {
      return NextResponse.json(
        { success: false, error: "Solo se puede pausar un aviso activo" },
        { status: 400 },
      );
    }

    const updated = await prisma.atsJobPosting.update({
      where: { id: jobId },
      data: { estado: "PAUSADO" },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[ATS] Error pausing job:", error);
    return NextResponse.json({ success: false, error: "Error al pausar aviso" }, { status: 500 });
  }
}
