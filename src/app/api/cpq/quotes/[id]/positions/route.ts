/**
 * API Route: /api/cpq/quotes/[id]/positions
 * POST - Crear puesto de trabajo con estructura de servicio
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from '@/lib/require-module';
import { insertQuotePosition } from "@/modules/cpq/quote-position-write.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const {
      puestoTrabajoId,
      customName,
      description,
      weekdays,
      startTime,
      endTime,
      numGuards,
      numPuestos,
      cargoId,
      rolId,
      baseSalary,
      afpName,
      healthSystem,
      healthPlanPct,
      serviceGroupId,
    } = body || {};

    if (
      !puestoTrabajoId ||
      !Array.isArray(weekdays) ||
      !startTime ||
      !endTime ||
      !numGuards ||
      !cargoId ||
      !rolId ||
      !baseSalary
    ) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    try {
      const result = await insertQuotePosition({
        quoteId: id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        body: {
          puestoTrabajoId,
          weekdays,
          startTime,
          endTime,
          numGuards: Number(numGuards),
          numPuestos,
          cargoId,
          rolId,
          baseSalary: Number(baseSalary),
          afpName,
          healthSystem,
          healthPlanPct,
          serviceGroupId,
          customName,
          description,
        },
      });

      return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "VALIDATION_FIELDS") {
        return NextResponse.json(
          { success: false, error: "weekdays must contain at least one valid day" },
          { status: 400 },
        );
      }
      console.error(err);
      return NextResponse.json(
        { success: false, error: "Failed to create position" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Error creating CPQ position:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create position" },
      { status: 500 }
    );
  }
}
