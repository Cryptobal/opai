/**
 * Hub queries — all data-fetching functions for the Hub dashboard.
 *
 * Existing functions (extracted from page.tsx):
 *   - getDocsSignals
 *   - getCommercialMetrics
 *   - getFinanceMetrics
 *
 * New functions (v1):
 *   - getOpsMetrics
 *   - getAlerts
 *   - getRecentActivity
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getUfValue } from '@/lib/uf';
import { getTenantCompanyConfig } from '@/lib/tenant-config';
import {
  collectLinkedQuoteIds,
  resolveDealActiveQuotationSummary,
} from '@/lib/crm-deal-active-quotation';
import { toPercent, getTodayChile } from './hub-utils';
import { triggerFollowUpProcessing } from '@/lib/followup-selfheal';
import {
  NOTIFICATION_TYPES,
  canSeeNotificationType,
  type UserNotifPrefsMap,
} from '@/lib/notification-types';
import type { RolePermissions } from '@/lib/permissions';
import type {
  CrmMetrics,
  DocsSignals,
  FinanceMetrics,
  OpsMetrics,
  HubAlert,
  ActivityEntry,
  HubNotification,
  NotificationType,
  TicketMetrics,
  SupervisionMetrics,
  ClosingHubData,
  ClosingHotDeal,
  ClosingStaleDeal,
  ClosingPendingLead,
  ClosingPortalTopUser,
  AtsMetrics,
  PayrollMetrics,
  PersonasMetrics,
} from './hub-types';

/* ------------------------------------------------------------------ */
/* Docs signals (existing)                                            */
/* ------------------------------------------------------------------ */

export async function getDocsSignals(
  tenantId: string,
  thirtyDaysAgo: Date,
): Promise<DocsSignals> {
  // Include both 'sent' and 'viewed' statuses — when a client opens a
  // presentation the track endpoint changes status from 'sent' to 'viewed',
  // so filtering only by 'sent' would exclude all viewed presentations.
  const sentOrViewed = { in: ['sent', 'viewed'] };

  const [sent30, viewed30, unread30] = await Promise.all([
    prisma.presentation.count({
      where: {
        tenantId,
        status: sentOrViewed,
        emailSentAt: { gte: thirtyDaysAgo },
        archivedAt: null,
      },
    }),
    prisma.presentation.count({
      where: {
        tenantId,
        status: sentOrViewed,
        emailSentAt: { gte: thirtyDaysAgo },
        viewCount: { gt: 0 },
        archivedAt: null,
      },
    }),
    prisma.presentation.count({
      where: {
        tenantId,
        status: sentOrViewed,
        emailSentAt: { gte: thirtyDaysAgo },
        viewCount: 0,
        archivedAt: null,
      },
    }),
  ]);

  return {
    sent30,
    viewed30,
    unread30,
    viewRate30: toPercent(viewed30, sent30),
  };
}

/* ------------------------------------------------------------------ */
/* Hub de Cierre — consolidated closing hub data                      */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

/** Portal engagement metrics for heat score */
interface PortalEngagement {
  totalViews: number;
  totalDownloads: number;
  totalLogins: number;
  lastViewedAt: Date | null;
  lastDownloadAt: Date | null;
  lastLoginAt: Date | null;
}

function getLastPortalActivity(eng: PortalEngagement): Date | null {
  const dates = [eng.lastViewedAt, eng.lastDownloadAt, eng.lastLoginAt].filter(Boolean) as Date[];
  return dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

function computeHeatScore(eng: PortalEngagement, now: Date): number {
  const lastActivity = getLastPortalActivity(eng);
  if (!lastActivity && eng.totalViews === 0 && eng.totalDownloads === 0 && eng.totalLogins === 0) return 0;
  // View component: each view = 8pts, capped at 35
  const viewScore = Math.min(eng.totalViews * 8, 35);
  // Download component: each download = 15pts, capped at 35 (strong signal of interest)
  const downloadScore = Math.min(eng.totalDownloads * 15, 35);
  // Login component: each login = 5pts, capped at 20
  const loginScore = Math.min(eng.totalLogins * 5, 20);
  // Recency: 30pts if activity today, decays over 7 days to 0
  const daysSince = lastActivity ? (now.getTime() - lastActivity.getTime()) / MS_PER_DAY : 999;
  const recencyScore = Math.max(0, Math.round(30 * (1 - daysSince / 7)));
  return Math.min(viewScore + downloadScore + loginScore + recencyScore, 100);
}

function computeViewTrend(lastActivityAt: Date | null, now: Date): 'up' | 'down' | 'flat' {
  if (!lastActivityAt) return 'flat';
  const daysSince = (now.getTime() - lastActivityAt.getTime()) / MS_PER_DAY;
  if (daysSince <= 3) return 'up';
  if (daysSince > 14) return 'down';
  return 'flat';
}

export async function getClosingHubData(
  tenantId: string,
  thirtyDaysAgo: Date,
  now: Date,
): Promise<ClosingHubData> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

  // Identify negotiating stages for accurate KPI filtering
  const negotiatingStages = await prisma.crmPipelineStage.findMany({
    where: {
      tenantId,
      isActive: true,
      isClosedWon: false,
      isClosedLost: false,
      name: { contains: 'negoci', mode: 'insensitive' },
    },
    select: { id: true },
  });
  const negotiatingStageIds = new Set(negotiatingStages.map((s) => s.id));

  // Batch 1: parallel queries
  const [
    openDeals,
    pendingLeadsRaw,
    openLeadsCount,
    newLeads30,
    leadsConverted30,
    proposalsSent30,
    wonDealRows,
    docsSignals,
    followUpsOverdueCount,
    ufValue,
    quotesDraftCount,
    leadsDraftCount,
  ] = await Promise.all([
    // All open deals with relations
    prisma.crmDeal.findMany({
      where: { tenantId, status: 'open' },
      select: {
        id: true,
        title: true,
        amount: true,
        totalPuestos: true,
        proposalSentAt: true,
        stageId: true,
        activeQuotationId: true,
        createdAt: true,
        account: { select: { id: true, name: true } },
        primaryContact: {
          select: { firstName: true, lastName: true, email: true, phone: true, portalLastAccessAt: true },
        },
        stage: {
          select: { name: true, color: true, order: true, isClosedWon: true, isClosedLost: true, isAccepted: true },
        },
        quotes: { select: { quoteId: true } },
        followUpLogs: {
          where: { status: 'pending' },
          select: { id: true },
          take: 1,
        },
      },
    }),
    // Pending leads
    prisma.crmLead.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyName: true,
        source: true,
        createdAt: true,
      },
    }),
    // KPI counts
    prisma.crmLead.count({
      where: { tenantId, status: { in: ['pending', 'open', 'active'] } },
    }),
    prisma.crmLead.count({
      where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.crmLead.count({
      where: { tenantId, createdAt: { gte: thirtyDaysAgo }, convertedDealId: { not: null } },
    }),
    prisma.crmDeal.count({
      where: { tenantId, proposalSentAt: { gte: thirtyDaysAgo } },
    }),
    // Won deals in 30d (via stage history) — incluye tanto isClosedWon como
    // isAccepted (en este negocio "Adjudicado" se marca como isAccepted).
    prisma.crmDealStageHistory.findMany({
      where: {
        tenantId,
        changedAt: { gte: thirtyDaysAgo },
        toStage: { is: { OR: [{ isClosedWon: true }, { isAccepted: true }] } },
        deal: { is: { proposalSentAt: { not: null } } },
      },
      select: { dealId: true },
      distinct: ['dealId'],
    }),
    // Docs signals for viewRate
    getDocsSignals(tenantId, thirtyDaysAgo),
    // Follow-ups overdue
    prisma.crmFollowUpLog.count({
      where: { tenantId, status: 'pending', scheduledAt: { lte: now } },
    }),
    // UF value for amount conversion
    getUfValue(),
    // Draft quotes (not yet sent)
    prisma.cpqQuote.count({
      where: { tenantId, status: 'draft' },
    }),
    // Leads borrador (pending + in_review, not yet approved)
    prisma.crmLead.count({
      where: { tenantId, status: { in: ['pending', 'in_review'] } },
    }),
  ]);

  // Batch 2: depends on open deals
  const allQuoteIds = collectLinkedQuoteIds(openDeals);
  const openDealIds = openDeals.map((d) => d.id);

  const hasPortalAccessLog =
    typeof (prisma as unknown as Record<string, unknown>).portalAccessLog !== 'undefined';

  const accountIdsFromDeals = [...new Set(openDeals.map((d) => d.account?.id).filter(Boolean))] as string[];

  const [portalQuoteViews, portalQuoteDownloads, portalLogins, stageHistoryRows, negotiatingQuotes] = await Promise.all([
    // Portal quote views
    hasPortalAccessLog && allQuoteIds.length > 0
      ? prisma.portalAccessLog.findMany({
          where: {
            tenantId,
            portalType: 'cliente',
            action: 'view_quote',
            resource: { in: allQuoteIds },
          },
          select: { resource: true, createdAt: true },
        }).catch(() => [] as { resource: string | null; createdAt: Date }[])
      : [],
    // Portal quote downloads (strong signal of interest)
    hasPortalAccessLog && allQuoteIds.length > 0
      ? prisma.portalAccessLog.findMany({
          where: {
            tenantId,
            portalType: 'cliente',
            action: 'download_quote',
            resource: { in: allQuoteIds },
          },
          select: { resource: true, createdAt: true },
        }).catch(() => [] as { resource: string | null; createdAt: Date }[])
      : [],
    // Portal logins per account (how often client enters portal)
    hasPortalAccessLog && accountIdsFromDeals.length > 0
      ? prisma.portalAccessLog.findMany({
          where: {
            tenantId,
            portalType: 'cliente',
            action: 'login',
            accountId: { in: accountIdsFromDeals },
          },
          select: { accountId: true, createdAt: true },
        }).catch(() => [] as { accountId: string | null; createdAt: Date }[])
      : [],
    // Latest stage change per deal for daysInCurrentStage
    openDealIds.length > 0
      ? prisma.crmDealStageHistory.findMany({
          where: { dealId: { in: openDealIds } },
          orderBy: { changedAt: 'desc' },
          distinct: ['dealId'],
          select: { dealId: true, changedAt: true },
        })
      : [],
    // Quotes for amount resolution
    allQuoteIds.length > 0
      ? prisma.cpqQuote.findMany({
          where: { tenantId, id: { in: allQuoteIds } },
          select: {
            id: true,
            code: true,
            status: true,
            currency: true,
            monthlyCost: true,
            totalGuards: true,
            createdAt: true,
            updatedAt: true,
            parameters: { select: { salePriceMonthly: true } },
          },
        })
      : [],
  ]);

  // Build maps
  const stageChangedAtByDeal = new Map(stageHistoryRows.map((r) => [r.dealId, r.changedAt]));
  const quoteById = new Map(negotiatingQuotes.map((q) => [q.id, q]));

  // Group portal actions by quoteId (resource) and accountId
  const viewsByQuoteId = new Map<string, { total: number; lastAt: Date | null }>();
  for (const v of portalQuoteViews) {
    if (!v.resource) continue;
    const existing = viewsByQuoteId.get(v.resource);
    if (existing) {
      existing.total += 1;
      if (v.createdAt > (existing.lastAt ?? new Date(0))) existing.lastAt = v.createdAt;
    } else {
      viewsByQuoteId.set(v.resource, { total: 1, lastAt: v.createdAt });
    }
  }
  const downloadsByQuoteId = new Map<string, { total: number; lastAt: Date | null }>();
  for (const d of portalQuoteDownloads) {
    if (!d.resource) continue;
    const existing = downloadsByQuoteId.get(d.resource);
    if (existing) {
      existing.total += 1;
      if (d.createdAt > (existing.lastAt ?? new Date(0))) existing.lastAt = d.createdAt;
    } else {
      downloadsByQuoteId.set(d.resource, { total: 1, lastAt: d.createdAt });
    }
  }
  const loginsByAccountId = new Map<string, { total: number; lastAt: Date | null }>();
  for (const l of portalLogins) {
    if (!l.accountId) continue;
    const existing = loginsByAccountId.get(l.accountId);
    if (existing) {
      existing.total += 1;
      if (l.createdAt > (existing.lastAt ?? new Date(0))) existing.lastAt = l.createdAt;
    } else {
      loginsByAccountId.set(l.accountId, { total: 1, lastAt: l.createdAt });
    }
  }

  // Aggregate portal engagement per deal
  function getDealEngagement(deal: typeof openDeals[number]): PortalEngagement {
    let totalViews = 0;
    let totalDownloads = 0;
    let lastViewedAt: Date | null = null;
    let lastDownloadAt: Date | null = null;
    for (const link of deal.quotes) {
      const v = viewsByQuoteId.get(link.quoteId);
      if (v) {
        totalViews += v.total;
        if (v.lastAt && (!lastViewedAt || v.lastAt > lastViewedAt)) lastViewedAt = v.lastAt;
      }
      const d = downloadsByQuoteId.get(link.quoteId);
      if (d) {
        totalDownloads += d.total;
        if (d.lastAt && (!lastDownloadAt || d.lastAt > lastDownloadAt)) lastDownloadAt = d.lastAt;
      }
    }
    const accId = deal.account?.id ?? null;
    const logins = accId ? loginsByAccountId.get(accId) : null;
    const totalLogins = logins?.total ?? 0;
    const lastLoginAt = logins?.lastAt ?? null;
    return {
      totalViews,
      totalDownloads,
      totalLogins,
      lastViewedAt,
      lastDownloadAt,
      lastLoginAt,
    };
  }

  // Filter to only negotiating-stage deals for KPIs (not ALL open deals)
  const negotiatingDeals = negotiatingStageIds.size > 0
    ? openDeals.filter((d) => negotiatingStageIds.has(d.stageId))
    : openDeals; // fallback: if no negotiating stages defined, use all open

  // Compute negotiation summaries for KPIs
  const summaries = negotiatingDeals
    .map((d) => resolveDealActiveQuotationSummary(d, quoteById, ufValue))
    .filter(Boolean) as NonNullable<ReturnType<typeof resolveDealActiveQuotationSummary>>[];

  const guardsInNegotiation = summaries.reduce((acc, s) => acc + s.totalGuards, 0);
  const amountNegotiatingClp = summaries.reduce((acc, s) => acc + s.amountClp, 0);
  const amountNegotiatingUf = summaries.reduce((acc, s) => acc + s.amountUf, 0);

  const closedWon30 = wonDealRows.length;

  // Resolve per-deal amount from active quotation (falls back to deal.amount)
  function getDealAmount(deal: typeof openDeals[number]): number {
    const summary = resolveDealActiveQuotationSummary(deal, quoteById, ufValue);
    return summary ? summary.amountClp : Number(deal.amount);
  }

  // Build hot deals: open deals with portal engagement or proposal sent
  // EXCLUYE etapas cerradas (Adjudicado/Aceptado/Perdido) — un deal puede seguir
  // con status='open' aunque su stage ya sea closedWon, isAccepted o closedLost.
  // En este negocio "Adjudicado" usa isAccepted (proyecto aceptado, por iniciar).
  const hotDealCandidates: ClosingHotDeal[] = [];
  for (const deal of openDeals) {
    if (deal.stage.isClosedWon || deal.stage.isClosedLost || deal.stage.isAccepted) continue;
    const eng = getDealEngagement(deal);
    // "Caliente" = el cliente HA INTERACTUADO con el portal.
    // Antes incluíamos también deals con proposalSentAt aunque no tuvieran
    // engagement, pero eso llenaba la tabla con propuestas que nadie había
    // visto. Ahora exigimos al menos una vista, descarga o login del portal.
    const hasPortalEngagement = eng.totalViews > 0 || eng.totalDownloads > 0 || eng.totalLogins > 0;
    if (!hasPortalEngagement) continue;

    const lastActivity = getLastPortalActivity(eng);
    const contactName = [deal.primaryContact?.lastName, deal.primaryContact?.firstName]
      .filter(Boolean).join(' ') || 'Sin contacto';
    const stageChanged = stageChangedAtByDeal.get(deal.id);
    const stageEnteredAt = stageChanged ?? deal.createdAt;
    const daysInCurrentStage = Math.floor((now.getTime() - stageEnteredAt.getTime()) / MS_PER_DAY);

    hotDealCandidates.push({
      id: deal.id,
      companyName: deal.account?.name ?? 'Sin empresa',
      dealTitle: deal.title,
      contactName,
      contactPhone: deal.primaryContact?.phone ?? null,
      contactEmail: deal.primaryContact?.email ?? null,
      stageName: deal.stage.name,
      stageColor: deal.stage.color,
      stageOrder: deal.stage.order,
      amount: getDealAmount(deal),
      totalPuestos: deal.totalPuestos,
      totalViews: eng.totalViews + eng.totalDownloads,
      lastViewedAt: lastActivity,
      viewTrend: computeViewTrend(lastActivity, now),
      heatScore: computeHeatScore(eng, now),
      daysInCurrentStage,
      proposalSentAt: deal.proposalSentAt,
      proposalLink: null,
    });
  }
  hotDealCandidates.sort((a, b) => b.heatScore - a.heatScore || (
    (b.lastViewedAt?.getTime() ?? 0) - (a.lastViewedAt?.getTime() ?? 0)
  ));
  const hotDeals = hotDealCandidates.slice(0, 10);

  // ── Cierres recientes 30 días ──
  // Toma los wonDealRows (deals que pasaron a una etapa closedWon en últimos 30d)
  // y construye una lista enriquecida con info de la cuenta y monto.
  const wonDealIds = wonDealRows.map((r) => r.dealId);
  const recentWonDeals = wonDealIds.length > 0
    ? await prisma.crmDeal.findMany({
        where: { id: { in: wonDealIds }, tenantId },
        select: {
          id: true,
          title: true,
          amount: true,
          totalPuestos: true,
          activeQuotationId: true,
          account: { select: { id: true, name: true } },
          stage: { select: { name: true, color: true } },
          primaryContact: {
            select: { firstName: true, lastName: true, phone: true, email: true },
          },
          stageHistory: {
            where: {
              toStage: { is: { OR: [{ isClosedWon: true }, { isAccepted: true }] } },
              changedAt: { gte: thirtyDaysAgo },
            },
            orderBy: { changedAt: 'desc' },
            take: 1,
            select: { changedAt: true },
          },
          quotes: { select: { quoteId: true } },
        },
      })
    : [];

  const closedDeals: import('./hub-types').ClosingClosedDeal[] = recentWonDeals
    .map((deal) => {
      const summary = resolveDealActiveQuotationSummary(deal, quoteById, ufValue);
      const contactName = [deal.primaryContact?.lastName, deal.primaryContact?.firstName]
        .filter(Boolean).join(' ') || 'Sin contacto';
      return {
        id: deal.id,
        companyName: deal.account?.name ?? 'Sin empresa',
        dealTitle: deal.title,
        contactName,
        contactPhone: deal.primaryContact?.phone ?? null,
        contactEmail: deal.primaryContact?.email ?? null,
        stageName: deal.stage.name,
        stageColor: deal.stage.color,
        amount: summary ? summary.amountClp : Number(deal.amount),
        totalPuestos: deal.totalPuestos,
        closedAt: deal.stageHistory[0]?.changedAt ?? null,
      };
    })
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0));

  // Build stale deals: no portal activity (login/view/download) in 7+ days
  // (también excluye stages cerrados/aceptados igual que hot deals)
  const staleDealCandidates: ClosingStaleDeal[] = [];
  for (const deal of openDeals) {
    if (deal.stage.isClosedWon || deal.stage.isClosedLost || deal.stage.isAccepted) continue;
    if (!deal.proposalSentAt) continue;
    const eng = getDealEngagement(deal);
    const lastPortalActivity = getLastPortalActivity(eng);
    const contactPortalAccess = deal.primaryContact?.portalLastAccessAt ?? null;
    const lastActivity = [lastPortalActivity, contactPortalAccess]
      .filter(Boolean)
      .reduce<Date | null>((best, d) => (!best || d! > best ? d! : best), null);

    const daysSinceProposal = Math.floor(
      (now.getTime() - deal.proposalSentAt.getTime()) / MS_PER_DAY,
    );
    if (daysSinceProposal > 90) continue;
    const contactName = [deal.primaryContact?.lastName, deal.primaryContact?.firstName]
      .filter(Boolean).join(' ') || 'Sin contacto';
    const daysSinceLastActivity = lastActivity
      ? Math.floor((now.getTime() - lastActivity.getTime()) / MS_PER_DAY)
      : null;

    if (daysSinceProposal > 7 && !lastActivity) {
      staleDealCandidates.push({
        id: deal.id,
        companyName: deal.account?.name ?? 'Sin empresa',
        dealTitle: deal.title,
        contactName,
        contactPhone: deal.primaryContact?.phone ?? null,
        stageName: deal.stage.name,
        stageColor: deal.stage.color,
        amount: getDealAmount(deal),
        issue: 'Sin actividad en portal',
        issueType: 'no_views',
        daysSinceLastView: null,
      });
    } else if (daysSinceLastActivity !== null && daysSinceLastActivity >= 7 && deal.followUpLogs.length === 0) {
      staleDealCandidates.push({
        id: deal.id,
        companyName: deal.account?.name ?? 'Sin empresa',
        dealTitle: deal.title,
        contactName,
        contactPhone: deal.primaryContact?.phone ?? null,
        stageName: deal.stage.name,
        stageColor: deal.stage.color,
        amount: getDealAmount(deal),
        issue: `Sin actividad en portal hace ${daysSinceLastActivity}d`,
        issueType: 'no_followup',
        daysSinceLastView: daysSinceLastActivity,
      });
    } else if (deal.followUpLogs.length === 0 && lastActivity) {
      const daysSinceView = Math.floor((now.getTime() - lastActivity.getTime()) / MS_PER_DAY);
      if (daysSinceView >= 7) {
        staleDealCandidates.push({
          id: deal.id,
          companyName: deal.account?.name ?? 'Sin empresa',
          dealTitle: deal.title,
          contactName,
          contactPhone: deal.primaryContact?.phone ?? null,
          stageName: deal.stage.name,
          stageColor: deal.stage.color,
          amount: getDealAmount(deal),
          issue: 'Sin seguimiento programado',
          issueType: 'no_followup',
          daysSinceLastView: daysSinceView,
        });
      }
    }
  }
  staleDealCandidates.sort((a, b) => {
    if (a.issueType === 'no_views' && b.issueType !== 'no_views') return -1;
    if (b.issueType === 'no_views' && a.issueType !== 'no_views') return 1;
    return 0;
  });
  const staleDeals = staleDealCandidates.slice(0, 5);

  // Pending leads
  const pendingLeads: ClosingPendingLead[] = pendingLeadsRaw.map((l) => ({
    id: l.id,
    companyName: l.companyName,
    contactName: [l.lastName, l.firstName].filter(Boolean).join(' ') || 'Sin nombre',
    source: l.source,
    createdAt: l.createdAt,
  }));

  // Self-healing follow-ups (same pattern as getCommercialMetrics)
  if (followUpsOverdueCount > 0) {
    triggerFollowUpProcessing();
  }

  // Portal KPIs: quotes sent (status=sent in last 30d) vs viewed in portal
  const portalQuotesSent30 = await prisma.cpqQuote.count({
    where: { tenantId, status: 'sent', updatedAt: { gte: thirtyDaysAgo } },
  }).catch(() => 0);

  const portalViewedQuoteIds = new Set(portalQuoteViews.filter((v) => v.resource).map((v) => v.resource!));
  const portalQuotesViewed30 = portalViewedQuoteIds.size;

  // Resolve portal top users from PortalClienteAuditLog (historical) + PortalAccessLog
  const portalTopUsers: ClosingPortalTopUser[] = [];
  {
    const auditTopUsers = await prisma.portalClienteAuditLog.groupBy({
      by: ['contactId'],
      where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    }).catch(() => [] as { contactId: string; _count: { id: number }; _max: { createdAt: Date | null } }[]);

    if (auditTopUsers.length > 0) {
      const topContactIds = auditTopUsers.map((u) => u.contactId);

      const [contacts, quoteViewCounts] = await Promise.all([
        prisma.crmContact.findMany({
          where: { id: { in: topContactIds } },
          select: { id: true, firstName: true, lastName: true, accountId: true },
        }),
        hasPortalAccessLog
          ? prisma.portalAccessLog.groupBy({
              by: ['userId'],
              where: { tenantId, portalType: 'cliente', action: 'view_quote', createdAt: { gte: thirtyDaysAgo }, userId: { in: topContactIds } },
              _count: { id: true },
            }).catch(() => [] as { userId: string; _count: { id: number } }[])
          : [],
      ]);

      const contactMap = new Map(contacts.map((c) => [c.id, c]));
      const viewMap = new Map(quoteViewCounts.map((v) => [v.userId, v._count.id]));

      const accIds = [...new Set(contacts.map((c) => c.accountId).filter(Boolean) as string[])];
      const accounts = accIds.length > 0
        ? await prisma.crmAccount.findMany({ where: { id: { in: accIds } }, select: { id: true, name: true, status: true } })
        : [];
      const accountMap = new Map(accounts.map((a) => [a.id, a]));

      for (const raw of auditTopUsers) {
        const contact = contactMap.get(raw.contactId);
        const account = contact?.accountId ? accountMap.get(contact.accountId) : null;
        if (!contact || !account) continue;
        portalTopUsers.push({
          accountId: account.id,
          accountName: account.name,
          contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Sin nombre',
          isProspect: account.status === 'prospect',
          totalLogins: raw._count.id,
          totalQuoteViews: viewMap.get(raw.contactId) ?? 0,
          lastAccessAt: raw._max.createdAt,
        });
      }
    }
  }

  const tenantConfig = await getTenantCompanyConfig(tenantId);

  // Trend data for last 7 days (sparklines) — best-effort
  const last7DayBoundaries = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (6 - i));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  });

  let leadsTrend7d: number[] = new Array(7).fill(0);
  let dealsTrend7d: number[] = new Array(7).fill(0);
  try {
    const trendQueries = await Promise.all([
      ...last7DayBoundaries.map(({ start, end }) =>
        prisma.crmLead.count({
          where: { tenantId, createdAt: { gte: start, lt: end } },
        }),
      ),
      ...last7DayBoundaries.map(({ start, end }) =>
        prisma.crmDeal.count({
          where: {
            tenantId,
            status: 'open',
            createdAt: { gte: start, lt: end },
          },
        }),
      ),
    ]);
    leadsTrend7d = trendQueries.slice(0, 7);
    dealsTrend7d = trendQueries.slice(7, 14);
  } catch {
    /* ignore */
  }

  return {
    kpis: {
      openLeadsCount,
      newLeads30,
      leadsDraftCount,
      dealsNegotiatingCount: negotiatingDeals.length,
      amountNegotiatingClp,
      amountNegotiatingUf,
      guardsInNegotiation,
      closedWon30,
      closeRate30: toPercent(closedWon30, proposalsSent30),
      proposalViewRate30: docsSignals.viewRate30,
      proposalsSent30: docsSignals.sent30,
      proposalsViewed30: docsSignals.viewed30,
      followUpsOverdueCount,
      quotesDraftCount,
      portalQuotesViewed30,
      portalQuotesSent30,
      portalViewRate30: toPercent(portalQuotesViewed30, portalQuotesSent30),
    },
    hotDeals,
    staleDeals,
    closedDeals,
    pendingLeads,
    portalTopUsers,
    funnel: {
      leadsCreated: newLeads30,
      leadsConverted: leadsConverted30,
      proposalsSent: proposalsSent30,
      dealsWon: closedWon30,
      leadToDealRate: toPercent(leadsConverted30, newLeads30),
      proposalToWonRate: toPercent(closedWon30, proposalsSent30),
    },
    commercialName: tenantConfig.commercialName || 'OPAI',
    leadsTrend7d,
    dealsTrend7d,
  };
}

/* ------------------------------------------------------------------ */
/* Upcoming projects (deals in accepted/adjudicado stage)              */
/* ------------------------------------------------------------------ */

export async function getUpcomingProjects(
  tenantId: string,
): Promise<import('./hub-types').UpcomingProject[]> {
  const acceptedStages = await prisma.crmPipelineStage.findMany({
    where: { tenantId, isActive: true, isAccepted: true },
    select: { id: true, name: true, color: true },
  });

  if (acceptedStages.length === 0) return [];

  const stageMap = new Map(acceptedStages.map((s) => [s.id, s]));
  const deals = await prisma.crmDeal.findMany({
    where: {
      tenantId,
      stageId: { in: acceptedStages.map((s) => s.id) },
      serviceStartDate: { not: null },
    },
    include: {
      account: { select: { name: true } },
      primaryContact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { serviceStartDate: 'asc' },
  });

  const ufValue = await getUfValue();

  return deals.map((d) => {
    const stage = stageMap.get(d.stageId);
    const amountClp = Number(d.amount || 0);
    return {
      id: d.id,
      title: d.title,
      accountName: d.account?.name || 'Sin cliente',
      serviceStartDate: d.serviceStartDate!.toISOString(),
      stageName: stage?.name || '',
      stageColor: stage?.color || null,
      amountClp,
      totalGuards: d.totalPuestos,
      contactName: d.primaryContact
        ? `${d.primaryContact.firstName} ${d.primaryContact.lastName}`.trim()
        : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Commercial / CRM metrics — @deprecated (kept for backward compat)  */
/* ------------------------------------------------------------------ */

export async function getCommercialMetrics(
  tenantId: string,
  thirtyDaysAgo: Date,
  now: Date,
): Promise<CrmMetrics> {
  const leadOpenStatuses = ['pending', 'open', 'active'];
  const leadDraftStatuses = ['draft', 'in_review'];
  const negotiatingStages = await prisma.crmPipelineStage.findMany({
    where: {
      tenantId,
      isActive: true,
      isClosedWon: false,
      isClosedLost: false,
      name: { contains: 'negoci', mode: 'insensitive' },
    },
    select: { id: true },
  });
  const negotiatingStageIds = negotiatingStages.map((stage) => stage.id);
  const negotiatingDealsWhere =
    negotiatingStageIds.length > 0
      ? {
          tenantId,
          status: 'open',
          stageId: { in: negotiatingStageIds },
        }
      : {
          tenantId,
          status: 'open',
        };

  const [
    pendingLeadsCount,
    leadsOpenCount,
    leadsDraftCount,
    quotesDraftCount,
    leadsCreated30,
    leadsConverted30,
    proposalsSent30,
    openDealsInFollowUpCount,
    followUpsOverdueCount,
    followUpsFailed30,
    dealsWithoutPendingFollowUpCount,
    openLeads,
    overdueFollowUps,
    upcomingFollowUps,
    dealsWithoutPendingFollowUp,
    wonDealsWithProposal30Rows,
    negotiatingDeals,
  ] = await Promise.all([
    prisma.crmLead.count({
      where: { tenantId, status: 'pending' },
    }),
    prisma.crmLead.count({
      where: { tenantId, status: { in: leadOpenStatuses } },
    }),
    prisma.crmLead.count({
      where: { tenantId, status: { in: leadDraftStatuses } },
    }),
    prisma.cpqQuote.count({
      where: { tenantId, status: 'draft' },
    }),
    prisma.crmLead.count({
      where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.crmLead.count({
      where: {
        tenantId,
        createdAt: { gte: thirtyDaysAgo },
        convertedDealId: { not: null },
      },
    }),
    prisma.crmDeal.count({
      where: {
        tenantId,
        proposalSentAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.crmDeal.count({
      where: {
        tenantId,
        status: 'open',
        proposalSentAt: { not: null },
      },
    }),
    prisma.crmFollowUpLog.count({
      where: {
        tenantId,
        status: 'pending',
        scheduledAt: { lte: now },
      },
    }),
    prisma.crmFollowUpLog.count({
      where: {
        tenantId,
        status: 'failed',
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.crmDeal.count({
      where: {
        tenantId,
        status: 'open',
        proposalSentAt: { not: null },
        followUpLogs: { none: { status: 'pending' } },
      },
    }),
    prisma.crmLead.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 8,
      select: {
        id: true,
        source: true,
        firstName: true,
        lastName: true,
        email: true,
        companyName: true,
        createdAt: true,
      },
    }),
    prisma.crmFollowUpLog.findMany({
      where: {
        tenantId,
        status: 'pending',
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 8,
      select: {
        id: true,
        sequence: true,
        scheduledAt: true,
        deal: {
          select: {
            id: true,
            title: true,
            account: { select: { name: true } },
            primaryContact: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    }),
    prisma.crmFollowUpLog.findMany({
      where: {
        tenantId,
        status: 'pending',
        scheduledAt: { gt: now },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 8,
      select: {
        id: true,
        sequence: true,
        scheduledAt: true,
        deal: {
          select: {
            id: true,
            title: true,
            account: { select: { name: true } },
            primaryContact: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    }),
    prisma.crmDeal.findMany({
      where: {
        tenantId,
        status: 'open',
        proposalSentAt: { not: null },
        followUpLogs: { none: { status: 'pending' } },
      },
      orderBy: { proposalSentAt: 'asc' },
      take: 8,
      select: {
        id: true,
        title: true,
        proposalSentAt: true,
        account: { select: { name: true } },
      },
    }),
    prisma.crmDealStageHistory.findMany({
      where: {
        tenantId,
        changedAt: { gte: thirtyDaysAgo },
        toStage: { is: { isClosedWon: true } },
        deal: { is: { proposalSentAt: { not: null } } },
      },
      select: { dealId: true },
      distinct: ['dealId'],
    }),
    (prisma.crmDeal.findMany as any)({
      where: negotiatingDealsWhere,
      select: {
        id: true,
        activeQuotationId: true,
        quotes: {
          select: {
            quoteId: true,
          },
        },
      },
    }) as Promise<Array<{ id: string; activeQuotationId?: string | null; quotes: Array<{ quoteId: string }> }>>,
  ]);

  const negotiatingQuoteIds = collectLinkedQuoteIds(negotiatingDeals);
  const [ufValue, negotiatingQuotes] = await Promise.all([
    getUfValue(),
    negotiatingQuoteIds.length > 0
      ? prisma.cpqQuote.findMany({
          where: {
            tenantId,
            id: { in: negotiatingQuoteIds },
          },
          select: {
            id: true,
            code: true,
            status: true,
            currency: true,
            monthlyCost: true,
            totalGuards: true,
            createdAt: true,
            updatedAt: true,
            parameters: {
              select: {
                salePriceMonthly: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const negotiatingQuoteById = new Map(
    negotiatingQuotes.map((quote) => [quote.id, quote])
  );
  const activeNegotiationSummaries = negotiatingDeals
    .map((deal) =>
      resolveDealActiveQuotationSummary(deal, negotiatingQuoteById, ufValue)
    )
    .filter((summary): summary is NonNullable<typeof summary> =>
      Boolean(summary)
    );
  const guardsInNegotiation = activeNegotiationSummaries.reduce(
    (acc, summary) => acc + summary.totalGuards,
    0
  );
  const amountInNegotiationClp = activeNegotiationSummaries.reduce(
    (acc, summary) => acc + summary.amountClp,
    0
  );
  const amountInNegotiationUf = activeNegotiationSummaries.reduce(
    (acc, summary) => acc + summary.amountUf,
    0
  );

  const wonDealsWithProposal30 = wonDealsWithProposal30Rows.length;
  const leadToDealRate30 = toPercent(leadsConverted30, leadsCreated30);
  const proposalToWonRate30 = toPercent(wonDealsWithProposal30, proposalsSent30);
  const followUpCoverageRate = toPercent(
    Math.max(0, openDealsInFollowUpCount - dealsWithoutPendingFollowUpCount),
    openDealsInFollowUpCount,
  );

  // Self-healing: if there are overdue follow-ups, trigger processing
  // as a backup to the Vercel Cron job (fire-and-forget, non-blocking).
  if (followUpsOverdueCount > 0) {
    triggerFollowUpProcessing();
  }

  const funnel = [
    {
      label: 'Leads nuevos',
      value: leadsCreated30,
      href: '/crm/leads',
      rateFromPrev: null as number | null,
    },
    {
      label: 'Leads convertidos',
      value: leadsConverted30,
      href: '/crm/leads',
      rateFromPrev: toPercent(leadsConverted30, leadsCreated30),
    },
    {
      label: 'Propuestas enviadas',
      value: proposalsSent30,
      href: '/crm/deals',
      rateFromPrev: toPercent(proposalsSent30, leadsConverted30),
    },
    {
      label: 'Negocios ganados',
      value: wonDealsWithProposal30,
      href: '/crm/deals',
      rateFromPrev: toPercent(wonDealsWithProposal30, proposalsSent30),
    },
  ];

  return {
    pendingLeadsCount,
    leadsOpenCount,
    leadsDraftCount,
    quotesDraftCount,
    dealsNegotiatingCount: negotiatingDeals.length,
    guardsInNegotiation,
    amountInNegotiationClp,
    amountInNegotiationUf,
    leadsCreated30,
    leadsConverted30,
    leadToDealRate30,
    proposalsSent30,
    wonDealsWithProposal30,
    proposalToWonRate30,
    openDealsInFollowUpCount,
    followUpsOverdueCount,
    followUpsFailed30,
    followUpCoverageRate,
    dealsWithoutPendingFollowUpCount,
    openLeads,
    overdueFollowUps,
    followUpQueue:
      overdueFollowUps.length > 0 ? overdueFollowUps : upcomingFollowUps,
    dealsWithoutPendingFollowUp,
    funnel,
  };
}

/* ------------------------------------------------------------------ */
/* Finance metrics (existing)                                         */
/* ------------------------------------------------------------------ */

export async function getFinanceMetrics(
  tenantId: string,
): Promise<FinanceMetrics> {
  const [pendingApproval, approvedUnpaid] = await Promise.all([
    prisma.financeRendicion.findMany({
      where: { tenantId, status: { in: ['SUBMITTED', 'IN_APPROVAL'] } },
      select: { amount: true },
    }),
    prisma.financeRendicion.findMany({
      where: { tenantId, status: 'APPROVED', paidAt: null },
      select: { amount: true },
    }),
  ]);

  return {
    pendingApprovalCount: pendingApproval.length,
    pendingApprovalAmount: pendingApproval.reduce(
      (sum, r) => sum + r.amount,
      0,
    ),
    approvedUnpaidCount: approvedUnpaid.length,
    approvedUnpaidAmount: approvedUnpaid.reduce((sum, r) => sum + r.amount, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Ops metrics (new — v1)                                             */
/* ------------------------------------------------------------------ */

export async function getOpsMetrics(
  tenantId: string,
): Promise<OpsMetrics> {
  const todayStr = getTodayChile();
  const todayDate = new Date(todayStr);
  const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
  const prismaAny = prisma as unknown as {
    opsRefuerzoSolicitud?: {
      count: (args: unknown) => Promise<number>;
      findMany: (args: unknown) => Promise<Array<{ estimatedTotalClp: unknown }>>;
    };
  };
  const hasRefuerzosModel = Boolean(prismaAny.opsRefuerzoSolicitud);

  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);

  const [
    activePuestos,
    activeGuardias,
    guardiasNuevosMes,
    pendingTE,
    ppcGaps,
    attPresent,
    attAbsent,
    attPending,
    attReplacement,
    roundsScheduled,
    roundsCompleted,
    roundsInProgress,
    roundsMissed,
    unresolvedAlerts,
    criticalAlerts,
    refuerzosActivosHoy,
    refuerzosProximos,
    refuerzosPendientesFacturar,
  ] = await Promise.all([
    prisma.opsPuestoOperativo.count({
      where: { tenantId, active: true },
    }),
    // Guardias activos = status active AND asignados a una instalación
    // (excluye postulantes/seleccionados que aún no operan en terreno)
    prisma.opsGuardia.count({
      where: { tenantId, status: 'active', currentInstallationId: { not: null } },
    }),
    prisma.opsGuardia.count({
      where: { tenantId, status: 'active', createdAt: { gte: monthStart } },
    }),
    prisma.opsTurnoExtra.count({
      where: { tenantId, status: 'pending' },
    }),
    // PPC: count distinct positions without a planned guard for TODAY
    prisma.opsPautaMensual.findMany({
      where: {
        tenantId,
        date: todayDate,
        plannedGuardiaId: null,
        shiftCode: { notIn: ['-', 'V', 'L', 'P', 'PCG', 'PSG'] },
      },
      select: { puestoId: true },
      distinct: ['puestoId'],
    }).then((rows) => rows.length),
    // Attendance by status
    prisma.opsAsistenciaDiaria.count({
      where: { tenantId, date: todayDate, attendanceStatus: 'presente' },
    }),
    prisma.opsAsistenciaDiaria.count({
      where: { tenantId, date: todayDate, attendanceStatus: 'ausente' },
    }),
    prisma.opsAsistenciaDiaria.count({
      where: { tenantId, date: todayDate, attendanceStatus: 'pendiente' },
    }),
    prisma.opsAsistenciaDiaria.count({
      where: {
        tenantId,
        date: todayDate,
        replacementGuardiaId: { not: null },
      },
    }),
    // Rounds today
    prisma.opsRondaEjecucion.count({
      where: {
        tenantId,
        scheduledAt: {
          gte: todayDate,
          lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.opsRondaEjecucion.count({
      where: {
        tenantId,
        status: 'completada',
        scheduledAt: {
          gte: todayDate,
          lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.opsRondaEjecucion.count({
      where: {
        tenantId,
        status: 'en_curso',
        scheduledAt: {
          gte: todayDate,
          lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.opsRondaEjecucion.count({
      where: {
        tenantId,
        status: { in: ['incompleta', 'no_realizada'] },
        scheduledAt: {
          gte: todayDate,
          lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.opsAlertaRonda.count({
      where: {
        tenantId,
        resuelta: false,
        archivedAt: null,
        tipo: { not: "sin_movimiento" },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.opsAlertaRonda.count({
      where: {
        tenantId,
        resuelta: false,
        archivedAt: null,
        severidad: "critical",
        tipo: { not: "sin_movimiento" },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    hasRefuerzosModel
      ? prismaAny.opsRefuerzoSolicitud!.count({
          where: {
            tenantId,
            status: { not: "facturado" },
            startAt: { lte: tomorrowDate },
            endAt: { gte: todayDate },
          },
        })
      : Promise.resolve(0),
    hasRefuerzosModel
      ? prismaAny.opsRefuerzoSolicitud!.count({
          where: {
            tenantId,
            status: { not: "facturado" },
            startAt: { gt: tomorrowDate },
          },
        })
      : Promise.resolve(0),
    hasRefuerzosModel
      ? prismaAny.opsRefuerzoSolicitud!.findMany({
          where: {
            tenantId,
            status: { not: "facturado" },
          },
          select: { estimatedTotalClp: true },
        })
      : Promise.resolve([]),
  ]);

  const attTotal = attPresent + attAbsent + attPending + attReplacement;

  // Trend data for last 7 days (sparklines) — best-effort, fall back to zeros on failure
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  let attendanceTrend7d: number[] = new Array(7).fill(0);
  let roundsTrend7d: number[] = new Array(7).fill(0);
  try {
    const trendQueries = await Promise.all([
      ...last7Days.map((d) =>
        prisma.opsAsistenciaDiaria.count({
          where: { tenantId, date: d, attendanceStatus: 'presente' },
        }),
      ),
      ...last7Days.map((d) =>
        prisma.opsRondaEjecucion.count({
          where: {
            tenantId,
            status: 'completada',
            scheduledAt: {
              gte: d,
              lt: new Date(d.getTime() + 24 * 60 * 60 * 1000),
            },
          },
        }),
      ),
    ]);
    attendanceTrend7d = trendQueries.slice(0, 7);
    roundsTrend7d = trendQueries.slice(7, 14);
  } catch {
    /* ignore — trends are non-critical */
  }

  return {
    activePuestos,
    activeGuardias,
    guardiasNuevosMes,
    pendingTE,
    refuerzosActivosHoy,
    refuerzosProximos,
    refuerzosPendientesFacturarCount: refuerzosPendientesFacturar.length,
    refuerzosPendientesFacturarAmount: refuerzosPendientesFacturar.reduce(
      (acc, item) => acc + Number(item.estimatedTotalClp),
      0
    ),
    ppcGaps,
    attendance: {
      present: attPresent,
      absent: attAbsent,
      pending: attPending,
      replacement: attReplacement,
      total: attTotal,
      coveragePercent: toPercent(attPresent + attReplacement, attTotal),
    },
    rounds: {
      scheduled: roundsScheduled,
      completed: roundsCompleted,
      inProgress: roundsInProgress,
      missed: roundsMissed,
      completionPercent: toPercent(roundsCompleted, roundsScheduled),
    },
    unresolvedAlerts,
    criticalAlerts,
    attendanceTrend7d,
    roundsTrend7d,
  };
}

/* ------------------------------------------------------------------ */
/* Alerts (new — v1)                                                  */
/* ------------------------------------------------------------------ */

export function getAlerts(
  opsMetrics: OpsMetrics | null,
  crmMetrics: CrmMetrics | null,
  financeMetrics: FinanceMetrics | null,
): HubAlert[] {
  const alerts: HubAlert[] = [];

  if (opsMetrics) {
    if (opsMetrics.attendance.absent > 0) {
      alerts.push({
        id: 'attendance-absent',
        severity:
          opsMetrics.attendance.absent >= 3 ? 'critical' : 'warning',
        message: `${opsMetrics.attendance.absent} ausencia(s) hoy sin reemplazo`,
        href: '/ops/pauta-diaria',
        count: opsMetrics.attendance.absent,
      });
    }

    if (opsMetrics.pendingTE > 0) {
      alerts.push({
        id: 'te-pending',
        severity: 'warning',
        message: `${opsMetrics.pendingTE} turno(s) extra pendiente(s) de aprobar`,
        href: '/ops/turnos-extra',
        count: opsMetrics.pendingTE,
      });
    }
  }

  if (crmMetrics && crmMetrics.followUpsOverdueCount > 0) {
    alerts.push({
      id: 'followups-overdue',
      severity: 'warning',
      message: `${crmMetrics.followUpsOverdueCount} seguimiento(s) vencido(s)`,
      href: '/crm/deals?focus=followup-overdue',
      count: crmMetrics.followUpsOverdueCount,
    });
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

/* ------------------------------------------------------------------ */
/* Recent activity (new — v1)                                         */
/* ------------------------------------------------------------------ */

export async function getRecentActivity(
  tenantId: string,
): Promise<ActivityEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      details: true,
      userEmail: true,
      createdAt: true,
    },
  });

  return rows as ActivityEntry[];
}

/* ------------------------------------------------------------------ */
/* Notifications (latest 3)                                           */
/* ------------------------------------------------------------------ */

export async function getNotifications(
  tenantId: string,
  userId: string,
  permissions: RolePermissions,
): Promise<HubNotification[]> {
  // 1. Get role-excluded notification types (same logic as /api/notifications)
  const roleExcludedTypes = NOTIFICATION_TYPES
    .filter((t) => !canSeeNotificationType(permissions, t))
    .map((t) => t.key);

  // 2. Get user bell-disabled types
  const userPrefRecord = await prisma.notificationPreference.findUnique({
    where: { subscriberType_subscriberId: { subscriberType: "ADMIN", subscriberId: userId } },
  });
  const userDisabledTypes: string[] = [];
  if (userPrefRecord?.preferences) {
    const prefs = userPrefRecord.preferences as unknown as UserNotifPrefsMap;
    for (const [key, pref] of Object.entries(prefs)) {
      if (pref.bell === false) userDisabledTypes.push(key);
    }
  }

  // 3. Combine exclusions (keep "mention" out of base exclusions — handled separately)
  const allExcluded = [...new Set([...roleExcludedTypes, ...userDisabledTypes])];
  const baseExclusions = allExcluded.filter((type) => type !== "mention");

  // 4. Targeted types need per-user filtering
  const targetedTypes = [
    "ticket_approved",
    "ticket_rejected",
    "refuerzo_solicitud_created",
    "mention",
    "ticket_mention",
    "ticket_created",
  ];

  // 5. Build OR conditions (same logic as visibleNotificationsWhere in the API)
  const orConditions: Prisma.NotificationWhereInput[] = [
    {
      // General (non-targeted) notifications, respecting exclusions
      type: {
        notIn: baseExclusions.length > 0
          ? [...baseExclusions, ...targetedTypes]
          : targetedTypes,
      },
    },
    {
      // Mentions: only if targeted to this user
      type: "mention",
      OR: [
        { data: { path: ["targetUserId"], equals: userId } },
        { data: { path: ["mentionUserId"], equals: userId } },
      ],
    },
  ];

  // Other targeted types: only visible if targetUserId matches
  for (const targetedType of [
    "ticket_approved",
    "ticket_rejected",
    "refuerzo_solicitud_created",
    "ticket_mention",
    "ticket_created",
  ]) {
    if (baseExclusions.includes(targetedType)) continue;
    orConditions.push({
      type: targetedType,
      data: { path: ["targetUserId"], equals: userId },
    });
  }

  const rows = await prisma.notification.findMany({
    where: {
      tenantId,
      OR: orConditions,
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      type: true,
      title: true,
      link: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    type: resolveNotificationType(row.type),
    text: row.title,
    timestamp: row.createdAt,
    href: row.link || '/opai/notificaciones',
  }));
}

function resolveNotificationType(type: string): NotificationType {
  if (type.startsWith('lead') || type.includes('proposal') || type.includes('deal') || type.includes('quote')) return 'comercial';
  if (type.includes('ops') || type.includes('guardia') || type.includes('turno') || type.includes('ronda') || type.includes('attendance')) return 'operaciones';
  if (type.includes('finance') || type.includes('rendicion')) return 'finanzas';
  if (type.includes('lead')) return 'leads';
  return 'comercial';
}

/* ------------------------------------------------------------------ */
/* Ticket metrics                                                     */
/* ------------------------------------------------------------------ */

export async function getTicketMetrics(
  tenantId: string,
  userId: string,
): Promise<TicketMetrics> {
  const todayStr = getTodayChile();
  const todayDate = new Date(todayStr);
  const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();

  try {
    const [
      openCount,
      inProgressCount,
      resolvedTodayCount,
      breachedCount,
      p1PendingCount,
      unassignedCount,
      urgentTickets,
      myAssignedActiveCount,
    ] = await Promise.all([
      prisma.opsTicket.count({
        where: { tenantId, status: 'open' },
      }),
      prisma.opsTicket.count({
        where: { tenantId, status: 'in_progress' },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId,
          status: { in: ['resolved', 'closed'] },
          resolvedAt: { gte: todayDate, lt: tomorrowDate },
        },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId,
          status: { in: ['open', 'in_progress', 'waiting'] },
          OR: [
            { slaBreached: true },
            { slaDueAt: { lt: now } },
          ],
        },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId,
          priority: 'p1',
          status: { in: ['open', 'in_progress', 'waiting'] },
        },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId,
          assignedTo: null,
          status: { in: ['open', 'in_progress', 'waiting'] },
        },
      }),
      prisma.opsTicket.findMany({
        where: {
          tenantId,
          status: { in: ['open', 'in_progress', 'waiting'] },
        },
        orderBy: [
          { priority: 'asc' },
          { slaDueAt: 'asc' },
        ],
        take: 5,
        select: {
          id: true,
          code: true,
          title: true,
          priority: true,
          status: true,
          slaDueAt: true,
        },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId,
          assignedTo: userId,
          status: { in: ['open', 'in_progress', 'waiting', 'pending_approval'] },
        },
      }),
    ]);

    return {
      openCount,
      inProgressCount,
      resolvedTodayCount,
      breachedCount,
      p1PendingCount,
      unassignedCount,
      myAssignedActiveCount,
      urgentTickets: urgentTickets.map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        priority: t.priority,
        status: t.status,
        slaDueAt: t.slaDueAt?.toISOString() ?? null,
      })),
      moduleActive: true,
    };
  } catch {
    return {
      openCount: 0,
      inProgressCount: 0,
      resolvedTodayCount: 0,
      breachedCount: 0,
      p1PendingCount: 0,
      unassignedCount: 0,
      myAssignedActiveCount: 0,
      urgentTickets: [],
      moduleActive: false,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Supervision metrics                                                 */
/* ------------------------------------------------------------------ */

export async function getSupervisionMetrics(
  tenantId: string,
): Promise<SupervisionMetrics> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Query findings separately — the table may not exist yet
  let openFindingsRaw: { id: string; createdAt: Date }[] = [];
  try {
    openFindingsRaw = await prisma.opsSupervisionFinding.findMany({
      where: { tenantId, status: { in: ["open", "in_progress"] } },
      select: { id: true, createdAt: true },
    });
  } catch {
    // Table does not exist yet — gracefully degrade
  }

  const [allVisitas, assignments] = await Promise.all([
    prisma.opsVisitaSupervision.findMany({
      where: { tenantId, checkInAt: { gte: monthStart } },
      select: {
        id: true,
        status: true,
        installationState: true,
        installationId: true,
        ratings: true,
        checkInAt: true,
        installation: { select: { name: true } },
      },
      orderBy: { checkInAt: "desc" },
    }),
    prisma.opsAsignacionSupervisor.findMany({
      where: { tenantId, isActive: true },
      select: { installationId: true },
    }),
  ]);

  const assignmentSet = new Set(assignments.map((a) => a.installationId));

  function computePeriod(visitas: typeof allVisitas) {
    const completed = visitas.filter((v) => v.status === "completed").length;
    const criticas = visitas.filter((v) => v.installationState === "critico").length;

    const ratedVisits = visitas
      .map((v) => v.ratings as { presentacion?: number; orden?: number; protocolo?: number } | null)
      .filter((r): r is { presentacion: number; orden: number; protocolo: number } =>
        r !== null &&
        typeof r.presentacion === "number" &&
        typeof r.orden === "number" &&
        typeof r.protocolo === "number",
      );
    const avgRating = ratedVisits.length > 0
      ? Math.round((ratedVisits.reduce((s, r) => s + (r.presentacion + r.orden + r.protocolo) / 3, 0) / ratedVisits.length) * 10) / 10
      : null;

    const visitedSet = new Set(visitas.map((v) => v.installationId));
    const coveragePct = assignmentSet.size > 0
      ? Math.round((visitedSet.size / assignmentSet.size) * 100)
      : 0;
    const installationsSinVisita = Array.from(assignmentSet).filter((id) => !visitedSet.has(id)).length;

    return {
      visitas: visitas.length,
      completed,
      criticas,
      avgRating,
      coveragePct,
      installationsSinVisita,
      recentVisits: visitas.slice(0, 3).map((v) => ({
        id: v.id,
        installationName: v.installation.name,
        checkInAt: v.checkInAt,
        status: v.status,
        installationState: v.installationState,
      })),
    };
  }

  const weekVisitas = allVisitas.filter((v) => v.checkInAt >= weekStart);
  const overdueFindingsCount = openFindingsRaw.filter((f) => f.createdAt < weekStart).length;

  return {
    month: computePeriod(allVisitas),
    week: computePeriod(weekVisitas),
    openFindings: openFindingsRaw.length,
    overdueFindingsCount,
  };
}

/* ------------------------------------------------------------------ */
/* ATS metrics                                                         */
/* ------------------------------------------------------------------ */

export async function getAtsMetrics(tenantId: string): Promise<AtsMetrics | null> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const [openJobs, recentApplications, inProcess] = await Promise.all([
      prisma.atsJobPosting.count({ where: { tenantId, estado: 'ACTIVO' } }),
      prisma.atsApplication.count({
        where: { tenantId, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.atsApplication.count({
        where: { tenantId, etapa: { in: ['EN_REVISION', 'ENTREVISTA'] } },
      }),
    ]);
    return { openJobs, recentApplications, inProcess };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Payroll metrics                                                     */
/* ------------------------------------------------------------------ */

const SPANISH_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export async function getPayrollMetrics(tenantId: string): Promise<PayrollMetrics | null> {
  try {
    const currentPeriod = await prisma.payrollPeriod.findFirst({
      where: { tenantId, status: { in: ['OPEN', 'PROCESSING'] } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    let pendingAnticipos = 0;
    try {
      pendingAnticipos = await prisma.payrollAnticipoProcess.count({
        where: { tenantId, status: 'DRAFT' },
      });
    } catch {
      pendingAnticipos = 0;
    }

    const currentPeriodLabel = currentPeriod
      ? `${SPANISH_MONTHS[currentPeriod.month - 1] ?? currentPeriod.month} ${currentPeriod.year}`
      : null;

    // Build approximate "next close" = last day of the period month
    const nextCloseDate = currentPeriod
      ? new Date(currentPeriod.year, currentPeriod.month, 0)
      : null;

    return {
      currentPeriodLabel,
      currentPeriodStatus: currentPeriod?.status ?? null,
      pendingAnticipos,
      nextCloseDate,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Personas metrics                                                    */
/* ------------------------------------------------------------------ */

export async function getPersonasMetrics(tenantId: string): Promise<PersonasMetrics | null> {
  try {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [enOnboarding, documentacionPendiente, contratosPorVencer] = await Promise.all([
      prisma.opsGuardia.count({
        where: {
          tenantId,
          lifecycleStatus: { in: ['postulante', 'seleccionado'] },
        },
      }),
      prisma.opsDocumentoPersona.count({
        where: { tenantId, status: 'pending' },
      }),
      prisma.opsGuardia.count({
        where: {
          tenantId,
          status: 'active',
          contractType: 'plazo_fijo',
          OR: [
            { contractPeriod1End: { gte: now, lte: in30Days } },
            { contractPeriod2End: { gte: now, lte: in30Days } },
            { contractPeriod3End: { gte: now, lte: in30Days } },
          ],
        },
      }),
    ]);

    return { enOnboarding, documentacionPendiente, contratosPorVencer };
  } catch {
    return null;
  }
}
