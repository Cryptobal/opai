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
import { toPercent, getTodayChile } from './hub-utils';
import { triggerFollowUpProcessing } from '@/lib/followup-selfheal';
import type {
  CrmMetrics,
  DocsSignals,
  FinanceMetrics,
  OpsMetrics,
  HubAlert,
  ActivityEntry,
} from './hub-types';

/* ------------------------------------------------------------------ */
/* Docs signals (existing)                                            */
/* ------------------------------------------------------------------ */

export async function getDocsSignals(
  tenantId: string,
  thirtyDaysAgo: Date,
): Promise<DocsSignals> {
  const [sent30, viewed30, unread30] = await Promise.all([
    prisma.presentation.count({
      where: {
        tenantId,
        status: 'sent',
        emailSentAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.presentation.count({
      where: {
        tenantId,
        status: 'sent',
        emailSentAt: { gte: thirtyDaysAgo },
        viewCount: { gt: 0 },
      },
    }),
    prisma.presentation.count({
      where: {
        tenantId,
        status: 'sent',
        emailSentAt: { gte: thirtyDaysAgo },
        viewCount: 0,
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
/* Commercial / CRM metrics (existing)                                */
/* ------------------------------------------------------------------ */

export async function getCommercialMetrics(
  tenantId: string,
  thirtyDaysAgo: Date,
  now: Date,
): Promise<CrmMetrics> {
  const [
    pendingLeadsCount,
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
  ] = await Promise.all([
    prisma.crmLead.count({
      where: { tenantId, status: 'pending' },
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
  ]);

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
      where: { tenantId, status: 'APPROVED' },
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

  const [
    activePuestos,
    activeGuardias,
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
    prisma.opsGuardia.count({
      where: { tenantId, status: 'active' },
    }),
    prisma.opsTurnoExtra.count({
      where: { tenantId, status: 'pending' },
    }),
    prisma.opsPautaMensual.count({
      where: {
        tenantId,
        OR: [
          { plannedGuardiaId: null, shiftCode: { not: '-' } },
          { shiftCode: { in: ['V', 'L', 'P'] } },
        ],
      },
    }),
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
    // Alerts
    prisma.opsAlertaRonda.count({
      where: { tenantId, resuelta: false },
    }),
    prisma.opsAlertaRonda.count({
      where: { tenantId, resuelta: false, severidad: 'critical' },
    }),
    prisma.opsRefuerzoSolicitud.count({
      where: {
        tenantId,
        status: { not: "facturado" },
        startAt: { lte: tomorrowDate },
        endAt: { gte: todayDate },
      },
    }),
    prisma.opsRefuerzoSolicitud.count({
      where: {
        tenantId,
        status: { not: "facturado" },
        startAt: { gt: tomorrowDate },
      },
    }),
    prisma.opsRefuerzoSolicitud.findMany({
      where: {
        tenantId,
        status: { not: "facturado" },
      },
      select: { estimatedTotalClp: true },
    }),
  ]);

  const attTotal = attPresent + attAbsent + attPending + attReplacement;

  return {
    activePuestos,
    activeGuardias,
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
    if (opsMetrics.unresolvedAlerts > 0) {
      alerts.push({
        id: 'round-alerts',
        severity: opsMetrics.criticalAlerts > 0 ? 'critical' : 'warning',
        message: `${opsMetrics.unresolvedAlerts} alerta(s) de ronda sin resolver${opsMetrics.criticalAlerts > 0 ? ` (${opsMetrics.criticalAlerts} crítica(s))` : ''}`,
        href: '/ops/rondas/alertas',
        count: opsMetrics.unresolvedAlerts,
      });
    }

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

  if (financeMetrics && financeMetrics.pendingApprovalCount > 0) {
    alerts.push({
      id: 'rendiciones-pending',
      severity:
        financeMetrics.pendingApprovalCount >= 5 ? 'warning' : 'info',
      message: `${financeMetrics.pendingApprovalCount} rendición(es) pendiente(s) de aprobación`,
      href: '/finanzas/aprobaciones',
      count: financeMetrics.pendingApprovalCount,
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
    take: 10,
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
