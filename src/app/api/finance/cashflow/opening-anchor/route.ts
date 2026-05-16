import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

const openingSchema = z.object({
  bankBalanceClp: z.number().finite(),
  effectiveDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * POST /api/finance/cashflow/opening-anchor
 *
 * Crea el primer FinanceCashflowWeeklyClose con isAnchor=true para un
 * tenant que NO tiene ningún anchor previo. Sella el saldo banco real
 * como punto de partida del flujo de caja, sin afectar la contabilidad.
 *
 * Defensa en profundidad: si ya existe un anchor activo, retorna 409.
 * En ese caso el usuario debe usar el flujo regular de cierre semanal.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_manage")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(req, openingSchema);
  if (parsed.error) return parsed.error;

  const existing = await prisma.financeCashflowWeeklyClose.findFirst({
    where: { tenantId: ctx.tenantId, isAnchor: true },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        success: false,
        error: "Ya existe un anchor activo. Usá el cierre semanal regular.",
      },
      { status: 409 },
    );
  }

  const effective = parsed.data.effectiveDate
    ? new Date(parsed.data.effectiveDate)
    : new Date();
  const effectiveDate = new Date(
    effective.getUTCFullYear(),
    effective.getUTCMonth(),
    effective.getUTCDate(),
  );

  const balance = new Decimal(parsed.data.bankBalanceClp);
  const result = await prisma.financeCashflowWeeklyClose.create({
    data: {
      tenantId: ctx.tenantId,
      weekStartDate: effectiveDate,
      weekEndDate: effectiveDate,
      bankBalanceClp: balance,
      projectedBalanceClp: balance,
      varianceClp: new Decimal(0),
      isAnchor: true,
      varianceResolution: "ACCEPTED",
      closedBy: ctx.userId,
      notes:
        parsed.data.notes ??
        "Apertura del flujo de caja: sello del saldo banco real como punto de partida.",
    },
  });

  revalidatePath("/finanzas/flujo-caja");
  revalidatePath("/finanzas");

  return NextResponse.json({ success: true, data: result }, { status: 201 });
}
