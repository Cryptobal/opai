import { NextResponse } from "next/server";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";

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
 * (firstReplyAt − firstInboundAt) de los hilos de la casilla del usuario en los
 * últimos 30 días.
 */
export async function GET() {
  const access = await requireCorreosAccess();
  if (!access.authorized) return access.response;
  const ctx = access.ctx;

  const acc = await prisma.crmEmailAccount.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!acc) return NextResponse.json({ count: 0, medianMs: null, formatted: null });

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const rows = await prisma.crmEmailThread.findMany({
    where: {
      tenantId: ctx.tenantId,
      emailAccountId: acc.id,
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
