/**
 * API Route: POST /api/finance/billing/issued/bulk-resend-email
 *
 * Reenvía email de DTE para múltiples folios en una sola llamada.
 * Throttling: máx 50 IDs por request, batch de 5 paralelos para no
 * saturar Resend.
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
import { sendDteEmail } from "@/modules/finance/billing/dte-email.service";
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
  if (!hasFacturacionCapability(perms, "facturacion_resend_email")) {
    return NextResponse.json(
      { success: false, error: "No tiene permiso para reenviar emails" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, bodySchema);
  if (parsed.error) return parsed.error;

  const { dteIds } = parsed.data;

  // Multi-tenant: filtra por tenant antes de tocar nada.
  const owned = await prisma.financeDte.findMany({
    where: {
      tenantId: ctx.tenantId,
      direction: "ISSUED",
      id: { in: dteIds },
    },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((d) => d.id));
  const validIds = dteIds.filter((id) => ownedIds.has(id));
  const invalidIds = dteIds.filter((id) => !ownedIds.has(id));

  const sent: string[] = [];
  const failed: { id: string; error: string }[] = invalidIds.map((id) => ({
    id,
    error: "DTE no encontrado o no pertenece al tenant",
  }));

  for (let i = 0; i < validIds.length; i += BATCH_SIZE) {
    const slice = validIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      slice.map((id) =>
        sendDteEmail(
          ctx.tenantId,
          id,
          undefined,
          undefined,
          "manual_resend",
          ctx.userId,
          undefined,
        ),
      ),
    );
    results.forEach((r, idx) => {
      const id = slice[idx];
      if (r.status === "fulfilled" && r.value.success) {
        sent.push(id);
      } else {
        const errMsg =
          r.status === "rejected"
            ? (r.reason as Error)?.message ?? "Error desconocido"
            : r.value.error ?? "Error desconocido";
        failed.push({ id, error: errMsg });
      }
    });
  }

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "FinanceDte",
    details: {
      operation: "bulk_resend_email",
      sent: sent.length,
      failed: failed.length,
      dteIds: validIds,
    },
    request,
  });

  return NextResponse.json({
    success: true,
    data: {
      sent: sent.length,
      failed,
    },
  });
}
