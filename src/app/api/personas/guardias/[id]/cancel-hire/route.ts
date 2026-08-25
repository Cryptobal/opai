import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsCapability } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { getCancelHireEligibility } from "@/lib/personas-cancel-hire";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "rrhh_events");
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { lifecycleStatus: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const eligibility = await getCancelHireEligibility(ctx.tenantId, id, existing.lifecycleStatus);
    return NextResponse.json({ success: true, data: eligibility });
  } catch (error) {
    console.error("[PERSONAS] Error checking cancel-hire:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo verificar la anulación" },
      { status: 500 },
    );
  }
}
