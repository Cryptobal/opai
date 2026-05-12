import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { z } from "zod";

const updateConfigSchema = z.object({
  kmPerLiter: z.number().positive().optional(),
  fuelPricePerLiter: z.number().int().positive().optional(),
  vehicleFeePct: z.number().min(0).max(100).optional(),
  requireImage: z.boolean().optional(),
  requireObservations: z.boolean().optional(),
  requireTollImage: z.boolean().optional(),
  defaultApprover1Id: z.string().optional().nullable(),
  defaultApprover2Id: z.string().optional().nullable(),
  autoApproveWhenNoApprovers: z.boolean().optional(),
  maxDailyAmount: z.number().int().positive().optional().nullable(),
  maxMonthlyAmount: z.number().int().positive().optional().nullable(),
  pendingAlertDays: z.number().int().min(1).optional(),
  approvalAlertDays: z.number().int().min(1).optional(),
  santanderAccountNumber: z.string().max(50).optional().nullable(),
});

// ── GET: tenant config ──

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance", "configuracion")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver configuración" },
        { status: 403 },
      );
    }

    let config = await prisma.financeRendicionConfig.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    // Auto-create default config if it doesn't exist
    if (!config) {
      config = await prisma.financeRendicionConfig.create({
        data: { tenantId: ctx.tenantId },
      });
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[Finance] Error getting config:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la configuración" },
      { status: 500 },
    );
  }
}

// ── PUT: update config ──

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para modificar configuración" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, updateConfigSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const config = await prisma.financeRendicionConfig.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        ...body,
      },
      update: body,
    });

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[Finance] Error updating config:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la configuración" },
      { status: 500 },
    );
  }
}
