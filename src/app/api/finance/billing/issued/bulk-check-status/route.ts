/**
 * API Route: POST /api/finance/billing/issued/bulk-check-status
 *
 * Consulta al SII el estado de múltiples DTEs. Throttling: máx 50 IDs;
 * batch de 5 paralelos.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { checkDteStatus } from "@/modules/finance/billing/dte-issuer.service";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  dteIds: z.array(z.string().uuid()).min(1).max(50),
});

const BATCH_SIZE = 5;

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, bodySchema);
  if (parsed.error) return parsed.error;

  const { dteIds } = parsed.data;

  const owned = await prisma.financeDte.findMany({
    where: {
      tenantId: ctx.tenantId,
      direction: "ISSUED",
      id: { in: dteIds },
    },
    select: { id: true, siiStatus: true },
  });
  const ownedMap = new Map(owned.map((d) => [d.id, d.siiStatus]));
  const validIds = dteIds.filter((id) => ownedMap.has(id));
  const invalidIds = dteIds.filter((id) => !ownedMap.has(id));

  const updated: { id: string; oldStatus: string; newStatus: string }[] = [];
  const failed: { id: string; error: string }[] = invalidIds.map((id) => ({
    id,
    error: "DTE no encontrado o no pertenece al tenant",
  }));

  for (let i = 0; i < validIds.length; i += BATCH_SIZE) {
    const slice = validIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      slice.map((id) => checkDteStatus(ctx.tenantId, id)),
    );
    results.forEach((r, idx) => {
      const id = slice[idx];
      const oldStatus = ownedMap.get(id) ?? "UNKNOWN";
      if (r.status === "fulfilled") {
        const newStatus = String(r.value?.status ?? oldStatus);
        updated.push({ id, oldStatus, newStatus });
      } else {
        const errMsg = (r.reason as Error)?.message ?? "Error desconocido";
        failed.push({ id, error: errMsg });
      }
    });
  }

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "READ",
    entity: "FinanceDte",
    details: {
      operation: "bulk_check_status",
      updated: updated.length,
      failed: failed.length,
      dteIds: validIds,
    },
    request,
  });

  return NextResponse.json({
    success: true,
    data: {
      updated,
      failed,
    },
  });
}
