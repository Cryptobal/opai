/**
 * GET /api/ops/compliance-alerts
 * Alertas de cumplimiento Resolución N°38.
 * Devuelve conteos de guardias con datos faltantes.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const [
      totalGuardias,
      sinEmailPersonal,
      sinPin,
    ] = await Promise.all([
      prisma.opsGuardia.count({
        where: {
          tenantId: ctx.tenantId,
          status: "active",
          lifecycleStatus: { in: ["seleccionado", "contratado"] },
        },
      }),
      // Guardias activos sin email personal (ni en OpsGuardia ni en OpsPersona)
      prisma.opsGuardia.count({
        where: {
          tenantId: ctx.tenantId,
          status: "active",
          lifecycleStatus: { in: ["seleccionado", "contratado"] },
          personalEmail: null,
          persona: {
            AND: [
              { personalEmail: null },
              { OR: [{ email: null }, { email: "" }] },
            ],
          },
        },
      }),
      prisma.opsGuardia.count({
        where: {
          tenantId: ctx.tenantId,
          status: "active",
          lifecycleStatus: { in: ["seleccionado", "contratado"] },
          marcacionPin: null,
        },
      }),
    ]);

    const alerts = [];

    if (sinEmailPersonal > 0) {
      alerts.push({
        type: "warning",
        code: "guardias_sin_email",
        message: `${sinEmailPersonal} guardia${sinEmailPersonal > 1 ? "s" : ""} sin email personal registrado — requerido para comprobantes de asistencia (Res. N°38)`,
        count: sinEmailPersonal,
        total: totalGuardias,
      });
    }

    if (sinPin > 0) {
      alerts.push({
        type: "info",
        code: "guardias_sin_pin",
        message: `${sinPin} guardia${sinPin > 1 ? "s" : ""} sin PIN de marcación configurado`,
        count: sinPin,
        total: totalGuardias,
      });
    }

    return NextResponse.json({
      success: true,
      data: { alerts, totalGuardias },
    });
  } catch (error) {
    console.error("[OPS] Error fetching compliance alerts:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
