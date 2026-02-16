import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { confirmPayment, cancelPayment } from "@/modules/finance/banking/payment-record.service";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const record = await prisma.financePaymentRecord.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        bankAccount: true,
        supplier: true,
        allocations: { include: { dte: true } },
      },
    });
    if (!record) return NextResponse.json({ success: false, error: "Pago no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("[Finance/Payments] Error getting record:", error);
    return NextResponse.json({ success: false, error: "Error al obtener pago" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const action = body.action as string;

    if (action === "confirm") {
      const record = await confirmPayment(ctx.tenantId, id);
      return NextResponse.json({ success: true, data: record });
    } else if (action === "cancel") {
      const record = await cancelPayment(ctx.tenantId, id);
      return NextResponse.json({ success: true, data: record });
    }

    return NextResponse.json({ success: false, error: "Accion no valida" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al actualizar pago";
    console.error("[Finance/Payments] Error updating record:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
