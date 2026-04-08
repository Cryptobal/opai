import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

const DPA_VERSION = "1.0";

/**
 * POST /api/tenant/dpa/accept
 * Marca el DPA (Contrato de Encargado de Tratamiento) como aceptado por el tenant.
 * Solo admins pueden aceptarlo en nombre del tenant.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    if (!["owner", "admin"].includes(auth.userRole)) {
      return NextResponse.json(
        { success: false, error: "Solo el owner o admin puede aceptar el DPA" },
        { status: 403 }
      );
    }

    const tenant = await prisma.tenant.update({
      where: { id: auth.tenantId },
      data: {
        dpaAcceptedAt: new Date(),
        dpaAcceptedBy: auth.userId,
        dpaVersion: DPA_VERSION,
      },
      select: { id: true, dpaAcceptedAt: true, dpaVersion: true },
    });

    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      action: "CONSENT_GRANTED",
      entity: "Tenant",
      entityId: tenant.id,
      details: { type: "DPA_ACCEPTED", version: DPA_VERSION },
      tenantId: auth.tenantId,
      request,
    });

    return NextResponse.json({ success: true, data: tenant });
  } catch (error) {
    console.error("[tenant/dpa/accept] Error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

/**
 * GET /api/tenant/dpa/accept — devuelve el estado actual del DPA del tenant.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { dpaAcceptedAt: true, dpaAcceptedBy: true, dpaVersion: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        accepted: !!tenant?.dpaAcceptedAt,
        acceptedAt: tenant?.dpaAcceptedAt ?? null,
        version: tenant?.dpaVersion ?? null,
        currentVersion: DPA_VERSION,
      },
    });
  } catch (error) {
    console.error("[tenant/dpa/accept GET] Error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
