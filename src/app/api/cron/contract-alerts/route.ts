/**
 * API Route: /api/cron/contract-alerts
 * GET - Verificar contratos de trabajo por vencer y crear alertas/notificaciones
 *
 * Diseñado para ejecutarse diariamente vía Vercel Cron.
 * Protegido con CRON_SECRET.
 *
 * Lógica:
 * 1. Buscar todos los guardias con contrato plazo_fijo activo
 * 2. Para cada uno, verificar si el contrato está por vencer (según contractAlertDaysBefore)
 * 3. Si ya venció, marcar como indefinido automáticamente
 * 4. Crear notificaciones para admin/operaciones
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { businessDaysBetween } from "@/lib/guard-events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let alertsSent = 0;
  let autoConverted = 0;

  try {
    // Find all guardias with plazo_fijo contracts
    const guardias = await prisma.opsGuardia.findMany({
      where: {
        contractType: "plazo_fijo",
        lifecycleStatus: { notIn: ["inactivo"] },
      },
      select: {
        id: true,
        tenantId: true,
        contractCurrentPeriod: true,
        contractPeriod1End: true,
        contractPeriod2End: true,
        contractPeriod3End: true,
        contractAlertDaysBefore: true,
        contractBecameIndefinidoAt: true,
        persona: { select: { firstName: true, lastName: true } },
      },
    });

    for (const g of guardias) {
      // Skip if already converted
      if (g.contractBecameIndefinidoAt) continue;

      // Get current period end date
      const period = g.contractCurrentPeriod ?? 1;
      let endDate: Date | null = null;
      switch (period) {
        case 3: endDate = g.contractPeriod3End; break;
        case 2: endDate = g.contractPeriod2End; break;
        default: endDate = g.contractPeriod1End; break;
      }

      if (!endDate) continue;

      const endStr = endDate.toISOString().slice(0, 10);
      const bDays = businessDaysBetween(today, endStr);
      const alertDays = g.contractAlertDaysBefore ?? 5;
      const fullName = `${g.persona.firstName} ${g.persona.lastName}`;

      // Check if contract has expired → auto-convert to indefinido
      if (bDays <= 0) {
        await prisma.opsGuardia.update({
          where: { id: g.id },
          data: {
            contractType: "indefinido",
            contractBecameIndefinidoAt: new Date(),
          },
        });
        autoConverted++;
        console.log(`[CONTRACT-ALERTS] ${fullName}: auto-converted to indefinido (expired)`);
        continue;
      }

      // Check if within alert window
      if (bDays <= alertDays) {
        // Create in-app notification (using existing notification system if available)
        // For now, log the alert
        console.log(
          `[CONTRACT-ALERTS] ${fullName}: contract expires in ${bDays} business days (${endStr})`
        );
        alertsSent++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        checked: guardias.length,
        alertsSent,
        autoConverted,
        date: today,
      },
    });
  } catch (error) {
    console.error("[CONTRACT-ALERTS] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error checking contracts" },
      { status: 500 }
    );
  }
}
