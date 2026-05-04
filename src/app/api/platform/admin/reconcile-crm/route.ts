/**
 * POST /api/platform/admin/reconcile-crm
 *
 * Endpoint admin (solo platform admins) para disparar reconciliación
 * deal-quote-installation sobre un tenant. Itera todos los deals
 * won/lost y aplica las propagaciones correspondientes.
 *
 * Body: { tenantId: string, dryRun?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePlatformAuth,
  platformUnauthorized,
} from "@/lib/platform-api-auth";
import {
  propagateDealWon,
  propagateDealLost,
  type DealWonPropagationResult,
  type DealLostPropagationResult,
} from "@/lib/crm/deal-propagation";

type WonRow = DealWonPropagationResult & { dealId: string; title: string };
type LostRow = DealLostPropagationResult & { dealId: string; title: string };

export async function POST(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const body = await request.json().catch(() => ({}));
  const tenantId = body?.tenantId as string | undefined;
  const dryRun = Boolean(body?.dryRun);

  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: "tenantId required" },
      { status: 400 }
    );
  }

  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, status: { in: ["won", "lost"] } },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  const dealsWon: WonRow[] = [];
  const dealsLost: LostRow[] = [];
  const unresolved: { dealId: string; reason: string }[] = [];

  for (const deal of deals) {
    if (dryRun) continue;
    try {
      if (deal.status === "won") {
        const result = await prisma.$transaction((tx) =>
          propagateDealWon(tx, tenantId, deal.id)
        );
        dealsWon.push({ ...result, dealId: deal.id, title: deal.title });
      } else {
        const result = await prisma.$transaction((tx) =>
          propagateDealLost(tx, tenantId, deal.id)
        );
        dealsLost.push({ ...result, dealId: deal.id, title: deal.title });
      }
    } catch (e) {
      unresolved.push({
        dealId: deal.id,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(
    `[reconcile-crm] platform=${ctx.email} tenant=${tenantId} dryRun=${dryRun} processed=${deals.length} won=${dealsWon.length} lost=${dealsLost.length} unresolved=${unresolved.length}`
  );

  return NextResponse.json({
    success: true,
    tenantId,
    dryRun,
    dealsProcessed: deals.length,
    dealsWon,
    dealsLost,
    unresolved,
  });
}
