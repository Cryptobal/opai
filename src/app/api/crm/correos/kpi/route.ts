import { NextRequest, NextResponse } from "next/server";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";
import { resolveMailboxScope } from "@/modules/crm/email/mailbox-scope";

export const dynamic = "force-dynamic";

/** Formatea una duración en ms a "h/min" legible. */
function fmt(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * GET /api/crm/correos/kpi — mediana del tiempo de respuesta
 * (firstReplyAt − firstInboundAt) de los hilos del alcance activo en los
 * últimos 30 días.
 */
export async function GET(req: NextRequest) {
  const access = await requireCorreosAccess();
  if (!access.authorized) return access.response;
  const ctx = access.ctx;

  const resolved = await resolveMailboxScope({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    requestedAccountId: req.nextUrl.searchParams.get("accountId"),
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (resolved.scope.accountIds.length === 0) {
    return NextResponse.json({ count: 0, medianMs: null, formatted: null });
  }

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const rows = await prisma.crmEmailThread.findMany({
    where: {
      tenantId: ctx.tenantId,
      emailAccountId: { in: resolved.scope.accountIds },
      firstInboundAt: { not: null },
      firstReplyAt: { not: null, gte: since },
    },
    select: { firstInboundAt: true, firstReplyAt: true },
    take: 500,
  });

  const deltas = rows
    .map((r) => r.firstReplyAt!.getTime() - r.firstInboundAt!.getTime())
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  if (!deltas.length) return NextResponse.json({ count: 0, medianMs: null, formatted: null });

  const mid = Math.floor(deltas.length / 2);
  const medianMs = deltas.length % 2 ? deltas[mid] : Math.round((deltas[mid - 1] + deltas[mid]) / 2);
  return NextResponse.json({ count: deltas.length, medianMs, formatted: fmt(medianMs) });
}
