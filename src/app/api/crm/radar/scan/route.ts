import { NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { classifyAccountThreads } from "@/modules/crm/email/radar-classifier.service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/crm/radar/scan — scan manual del Radar: corre la clasificación IA
 * sobre las casillas Gmail activas del usuario con un deadline compartido de
 * 20s. Devuelve cuántas casillas revisó, cuántos hilos analizó y cuántas
 * novedades (RadarItems) creó.
 */
export async function POST() {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const { tenantId, userId } = mod.ctx;

  const accounts = await prisma.crmEmailAccount.findMany({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true },
  });

  const deadlineMs = Date.now() + 20_000;
  let scanned = 0;
  let classified = 0;
  let created = 0;
  for (const acc of accounts) {
    const r = await classifyAccountThreads({
      tenantId,
      emailAccountId: acc.id,
      userId,
      deadlineMs,
    });
    scanned += 1;
    classified += r.classified;
    created += r.items.length;
  }

  return NextResponse.json({ scanned, classified, created });
}
