import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const modCheck = await requireTenantModule('ats');
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
    if (job.estado === "CERRADO") {
      return NextResponse.json({ success: false, error: "El aviso ya está cerrado" }, { status: 400 });
    }

    const updated = await prisma.atsJobPosting.update({
      where: { id: jobId },
      data: { estado: "CERRADO" },
    });

    // Marcar canales como expirados
    await prisma.atsDistributionChannel.updateMany({
      where: { jobPostingId: jobId, activo: true },
      data: { estado: "expirado", activo: false },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[ATS] Error closing job:", error);
    return NextResponse.json({ success: false, error: "Error al cerrar aviso" }, { status: 500 });
  }
}
