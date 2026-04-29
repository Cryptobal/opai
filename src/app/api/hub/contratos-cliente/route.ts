import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, unauthorized, resolveApiPerms } from '@/lib/api-auth';
import { canView } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hub/contratos-cliente
 *
 * Estado de contratos por cliente (derivado de CpqQuote vinculado al deal ganado):
 * - Sin contrato: cuentas activas sin quote ganado con contractStartDate.
 * - Por vencer: vence en próximos 90 días.
 * - Vencidos: pasó la fecha de fin estimada (contractStartDate + contractDuration meses).
 *
 * Nota: CrmDealQuote no tiene relación directa a CpqQuote en el schema,
 * por eso fetcheamos los quotes en una segunda query usando los quoteId.
 */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, 'crm', 'accounts')) {
      return NextResponse.json({ success: false, error: 'Sin permisos' }, { status: 403 });
    }

    // 1. Stages cerrados ganados (Adjudicado)
    const wonStages = await prisma.crmPipelineStage.findMany({
      where: { tenantId: ctx.tenantId, isClosedWon: true },
      select: { id: true },
    });
    const wonStageIds = wonStages.map((s) => s.id);

    // 2. Deals ganados con sus quoteIds
    const wonDeals = wonStageIds.length > 0
      ? await prisma.crmDeal.findMany({
          where: { tenantId: ctx.tenantId, stageId: { in: wonStageIds } },
          select: {
            id: true,
            accountId: true,
            account: { select: { id: true, name: true } },
            quotes: { select: { quoteId: true } },
          },
        })
      : [];

    // 3. Fetch CpqQuotes referenced (CrmDealQuote.quote relation does not exist; pull by id set)
    const allQuoteIds = [...new Set(wonDeals.flatMap((d) => d.quotes.map((q) => q.quoteId)))];
    const quotes = allQuoteIds.length > 0
      ? await prisma.cpqQuote.findMany({
          where: { id: { in: allQuoteIds }, tenantId: ctx.tenantId },
          select: {
            id: true,
            contractStartDate: true,
            contractDuration: true,
            monthlyCost: true,
          },
        })
      : [];
    const quoteById = new Map(quotes.map((q) => [q.id, q]));

    // 4. Cuentas activas (con installations activas)
    const accounts = await prisma.crmAccount.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        installations: { where: { status: 'active' }, select: { id: true } },
      },
    });
    const activeAccounts = accounts.filter((a) => a.installations.length > 0);

    // Build contract info per account
    const now = new Date();
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    type ContractInfo = {
      accountId: string;
      accountName: string;
      contractStart: Date | null;
      contractEnd: Date | null;
      monthlyCost: number;
      status: 'sin_contrato' | 'vigente' | 'por_vencer' | 'vencido';
      daysUntilEnd: number | null;
    };

    // Map: accountId → list of resolved quotes from won deals
    const quotesByAccount = new Map<string, typeof quotes>();
    for (const d of wonDeals) {
      if (!d.accountId) continue;
      const list = quotesByAccount.get(d.accountId) ?? [];
      for (const link of d.quotes) {
        const q = quoteById.get(link.quoteId);
        if (q) list.push(q);
      }
      quotesByAccount.set(d.accountId, list);
    }

    const contracts: ContractInfo[] = activeAccounts.map((acc) => {
      const accountQuotes = (quotesByAccount.get(acc.id) ?? []).filter((q) => q.contractStartDate);
      const latestQuote = accountQuotes.length > 0
        ? accountQuotes.reduce((latest, q) => {
            const ld = latest.contractStartDate?.getTime() ?? 0;
            const cd = q.contractStartDate?.getTime() ?? 0;
            return cd > ld ? q : latest;
          })
        : null;

      if (!latestQuote || !latestQuote.contractStartDate) {
        return {
          accountId: acc.id,
          accountName: acc.name,
          contractStart: null,
          contractEnd: null,
          monthlyCost: 0,
          status: 'sin_contrato',
          daysUntilEnd: null,
        };
      }

      const start = latestQuote.contractStartDate;
      const end = new Date(start);
      end.setMonth(end.getMonth() + (latestQuote.contractDuration ?? 12));
      const daysUntilEnd = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let status: ContractInfo['status'] = 'vigente';
      if (end < now) status = 'vencido';
      else if (end < ninetyDaysFromNow) status = 'por_vencer';

      return {
        accountId: acc.id,
        accountName: acc.name,
        contractStart: start,
        contractEnd: end,
        monthlyCost: Number(latestQuote.monthlyCost),
        status,
        daysUntilEnd,
      };
    });

    const sinContrato = contracts.filter((c) => c.status === 'sin_contrato');
    const porVencer = contracts
      .filter((c) => c.status === 'por_vencer')
      .sort((a, b) => (a.daysUntilEnd ?? 0) - (b.daysUntilEnd ?? 0));
    const vencidos = contracts.filter((c) => c.status === 'vencido');
    const vigentes = contracts.filter((c) => c.status === 'vigente');

    return NextResponse.json({
      success: true,
      summary: {
        sinContrato: sinContrato.length,
        porVencer: porVencer.length,
        vencidos: vencidos.length,
        vigentes: vigentes.length,
      },
      sinContrato: sinContrato.slice(0, 20),
      porVencer: porVencer.slice(0, 20),
      vencidos: vencidos.slice(0, 20),
    });
  } catch (err) {
    console.error('[HUB] contratos-cliente', err);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
