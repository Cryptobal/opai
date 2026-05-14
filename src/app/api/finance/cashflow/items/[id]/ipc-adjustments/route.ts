/**
 * GET /api/finance/cashflow/items/[id]/ipc-adjustments
 *
 * Lista historial de ajustes IPC (APPLIED y PENDING) de un item. Usado
 * por la UI de timeline en la tarjeta del contrato.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { listAdjustmentsByItem } from "@/modules/finance/cashflow/ipc-adjustment.service";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const rows = await listAdjustmentsByItem(ctx.tenantId, id);

  // Enriquecer con nombres de los admin que aplicaron, para mostrar
  // "aplicado por Carlos" en lugar de un id.
  const adminIds = Array.from(
    new Set(rows.map((r) => r.appliedBy).filter((v): v is string => !!v)),
  );
  const admins =
    adminIds.length === 0
      ? []
      : await prisma.admin.findMany({
          where: { id: { in: adminIds }, tenantId: ctx.tenantId },
          select: { id: true, name: true },
        });
  const adminMap = new Map(admins.map((a) => [a.id, a.name]));

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      dueDate: r.dueDate.toISOString().slice(0, 10),
      status: r.status,
      appliedPct: r.appliedPct,
      oldAmount: r.oldAmount,
      newAmount: r.newAmount,
      appliedAt: r.appliedAt?.toISOString() ?? null,
      appliedByName: r.appliedBy ? adminMap.get(r.appliedBy) ?? null : null,
      notes: r.notes,
    })),
  });
}
