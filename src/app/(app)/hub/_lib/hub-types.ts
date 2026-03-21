/**
 * Hub types — TypeScript interfaces for all hub sections and queries.
 * Refactored for accordion-based, mobile-first home.
 */

import type { ReactNode } from 'react';
import type { KpiVariant, TrendType } from '@/components/opai/KpiCard';

/* ------------------------------------------------------------------ */
/* Resolved permissions (passed from page to sections)                */
/* ------------------------------------------------------------------ */

export interface HubPerms {
  hasCrm: boolean;
  hasDocs: boolean;
  hasFinance: boolean;
  hasOps: boolean;
  canOpenLeads: boolean;
  canOpenDeals: boolean;
  canOpenQuotes: boolean;
  canCreateProposal: boolean;
  canConfigureCrm: boolean;
  canApproveTE: boolean;
  canManageRefuerzos: boolean;
  canApproveRendicion: boolean;
  canMarkAttendance: boolean;
  hasSupervision: boolean;
}

/* ------------------------------------------------------------------ */
/* CRM metrics                                                        */
/* ------------------------------------------------------------------ */

export interface CrmOpenLead {
  id: string;
  source: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  createdAt: Date;
}

export interface CrmFollowUpEntry {
  id: string;
  sequence: number;
  scheduledAt: Date;
  deal: {
    id: string;
    title: string;
    account: { name: string } | null;
    primaryContact: { firstName: string; lastName: string } | null;
  };
}

export interface CrmDealWithoutFollowUp {
  id: string;
  title: string;
  proposalSentAt: Date | null;
  account: { name: string } | null;
}

export interface FunnelStep {
  label: string;
  value: number;
  href: string;
  rateFromPrev: number | null;
}

export interface CrmMetrics {
  pendingLeadsCount: number;
  leadsOpenCount: number;
  leadsDraftCount: number;
  quotesDraftCount: number;
  dealsNegotiatingCount: number;
  guardsInNegotiation: number;
  amountInNegotiationClp: number;
  amountInNegotiationUf: number;
  leadsCreated30: number;
  leadsConverted30: number;
  leadToDealRate30: number;
  proposalsSent30: number;
  wonDealsWithProposal30: number;
  proposalToWonRate30: number;
  openDealsInFollowUpCount: number;
  followUpsOverdueCount: number;
  followUpsFailed30: number;
  followUpCoverageRate: number;
  dealsWithoutPendingFollowUpCount: number;
  openLeads: CrmOpenLead[];
  overdueFollowUps: CrmFollowUpEntry[];
  followUpQueue: CrmFollowUpEntry[];
  dealsWithoutPendingFollowUp: CrmDealWithoutFollowUp[];
  funnel: FunnelStep[];
}

/* ------------------------------------------------------------------ */
/* Docs signals                                                       */
/* ------------------------------------------------------------------ */

export interface DocsSignals {
  sent30: number;
  viewed30: number;
  unread30: number;
  viewRate30: number;
}

/* ------------------------------------------------------------------ */
/* Finance metrics                                                    */
/* ------------------------------------------------------------------ */

export interface FinanceMetrics {
  pendingApprovalCount: number;
  pendingApprovalAmount: number;
  approvedUnpaidCount: number;
  approvedUnpaidAmount: number;
}

/* ------------------------------------------------------------------ */
/* Ops metrics                                                        */
/* ------------------------------------------------------------------ */

export interface OpsAttendance {
  present: number;
  absent: number;
  pending: number;
  replacement: number;
  total: number;
  coveragePercent: number;
}

export interface OpsRounds {
  scheduled: number;
  completed: number;
  inProgress: number;
  missed: number;
  completionPercent: number;
}

export interface OpsMetrics {
  activePuestos: number;
  activeGuardias: number;
  guardiasNuevosMes: number;
  pendingTE: number;
  refuerzosActivosHoy: number;
  refuerzosProximos: number;
  refuerzosPendientesFacturarCount: number;
  refuerzosPendientesFacturarAmount: number;
  ppcGaps: number;
  attendance: OpsAttendance;
  rounds: OpsRounds;
  unresolvedAlerts: number;
  criticalAlerts: number;
}

/* ------------------------------------------------------------------ */
/* Alerts                                                             */
/* ------------------------------------------------------------------ */

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface HubAlert {
  id: string;
  severity: AlertSeverity;
  message: string;
  href: string;
  count?: number;
}

/* ------------------------------------------------------------------ */
/* Notifications                                                      */
/* ------------------------------------------------------------------ */

export type NotificationType = 'comercial' | 'operaciones' | 'finanzas' | 'leads';

export interface HubNotification {
  id: string;
  type: NotificationType;
  text: string;
  timestamp: Date;
  href: string;
}

/* ------------------------------------------------------------------ */
/* Tickets                                                            */
/* ------------------------------------------------------------------ */

export interface TicketUrgentItem {
  id: string;
  code: string;
  title: string;
  priority: string;
  status: string;
  slaDueAt: string | null;
}

export interface TicketMetrics {
  openCount: number;
  inProgressCount: number;
  resolvedTodayCount: number;
  breachedCount: number;
  p1PendingCount: number;
  unassignedCount: number;
  urgentTickets: TicketUrgentItem[];
  moduleActive: boolean;
}

/* ------------------------------------------------------------------ */
/* Activity (grouped)                                                 */
/* ------------------------------------------------------------------ */

export interface ActivityEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: unknown;
  userEmail: string | null;
  createdAt: Date;
}

export type ActivityCategory = 'all' | 'comercial' | 'ops' | 'finanzas' | 'sistema';

export interface GroupedActivity {
  key: string;
  action: string;
  entity: string;
  category: ActivityCategory;
  count: number;
  firstTimestamp: Date;
  lastTimestamp: Date;
  userEmail: string | null;
  entityId: string | null;
}

/* ------------------------------------------------------------------ */
/* Component props                                                    */
/* ------------------------------------------------------------------ */

export interface HubGreetingProps {
  firstName: string;
  pendingFollowUpsCount: number;
  showPortalLink?: boolean;
}

export interface HubQuickActionsProps {
  perms: HubPerms;
}

export interface HubExecutiveSnapshotProps {
  perms: HubPerms;
  opsMetrics: OpsMetrics | null;
  crmMetrics: CrmMetrics | null;
  financeMetrics: FinanceMetrics | null;
  docsSignals: DocsSignals | null;
}

export interface KpiLinkCardProps {
  href: string;
  title: string;
  value: string | number;
  description?: string;
  icon: ReactNode;
  trend?: TrendType;
  trendValue?: string;
  variant?: KpiVariant;
  titleInfoTooltip?: string;
  alert?: boolean;
}

export interface CompactStatProps {
  label: string;
  value: string | number;
}

export interface HubAlertasCriticasProps {
  alerts: HubAlert[];
}

export interface HubEstadoOperacionalProps {
  opsMetrics: OpsMetrics;
}

export interface HubAccionesPrioritariasProps {
  perms: HubPerms;
  opsMetrics: OpsMetrics | null;
  crmMetrics: CrmMetrics | null;
  financeMetrics: FinanceMetrics | null;
}

export interface HubCrmSectionProps {
  perms: HubPerms;
  crmMetrics: CrmMetrics;
  docsSignals: DocsSignals | null;
  financeMetrics: FinanceMetrics | null;
}

export interface HubFinanceSectionProps {
  financeMetrics: FinanceMetrics;
  opsMetrics: OpsMetrics | null;
}

export interface HubDocsSectionProps {
  docsSignals: DocsSignals;
}

export interface HubActividadRecienteProps {
  activities: ActivityEntry[];
}

export interface HubNotificationsProps {
  notifications: HubNotification[];
}

export interface HubTicketsSectionProps {
  ticketMetrics: TicketMetrics;
}

/* ------------------------------------------------------------------ */
/* Supervision metrics                                                 */
/* ------------------------------------------------------------------ */

export interface SupervisionRecentVisit {
  id: string;
  installationName: string;
  checkInAt: Date;
  status: string;
  installationState: string | null;
}

export interface SupervisionPeriodData {
  visitas: number;
  completed: number;
  criticas: number;
  avgRating: number | null;
  coveragePct: number;
  installationsSinVisita: number;
  recentVisits: SupervisionRecentVisit[];
}

export interface SupervisionMetrics {
  week: SupervisionPeriodData;
  month: SupervisionPeriodData;
  openFindings: number;
  overdueFindingsCount: number;
}

/* ------------------------------------------------------------------ */
/* Hub de Cierre (closing hub redesign)                                */
/* ------------------------------------------------------------------ */

export interface ClosingHubKpis {
  openLeadsCount: number;
  newLeads30: number;
  leadsDraftCount: number;
  dealsNegotiatingCount: number;
  amountNegotiatingClp: number;
  amountNegotiatingUf: number;
  guardsInNegotiation: number;
  closedWon30: number;
  closeRate30: number;
  proposalViewRate30: number;
  proposalsSent30: number;
  proposalsViewed30: number;
  followUpsOverdueCount: number;
  quotesDraftCount: number;
  portalQuotesViewed30: number;
  portalQuotesSent30: number;
  portalViewRate30: number;
}

export interface ClosingHotDeal {
  id: string;
  companyName: string;
  dealTitle: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  stageName: string;
  stageColor: string | null;
  stageOrder: number;
  amount: number;
  totalPuestos: number;
  totalViews: number;
  lastViewedAt: Date | null;
  viewTrend: 'up' | 'down' | 'flat';
  heatScore: number;
  daysInCurrentStage: number;
  proposalSentAt: Date | null;
  proposalLink: string | null;
}

export interface ClosingStaleDeal {
  id: string;
  companyName: string;
  dealTitle: string;
  contactName: string;
  contactPhone: string | null;
  stageName: string;
  stageColor: string | null;
  amount: number;
  issue: string;
  issueType: 'no_views' | 'no_followup';
  daysSinceLastView: number | null;
}

export interface ClosingPendingLead {
  id: string;
  companyName: string | null;
  contactName: string;
  source: string | null;
  createdAt: Date;
}

export interface ClosingFunnel {
  leadsCreated: number;
  leadsConverted: number;
  proposalsSent: number;
  dealsWon: number;
  leadToDealRate: number;
  proposalToWonRate: number;
}

export interface ClosingHubData {
  kpis: ClosingHubKpis;
  hotDeals: ClosingHotDeal[];
  staleDeals: ClosingStaleDeal[];
  pendingLeads: ClosingPendingLead[];
  funnel: ClosingFunnel;
  portalTopUsers: ClosingPortalTopUser[];
  /** Nombre comercial del tenant (ej. Gard, Gard Security) para mensajes WhatsApp. */
  commercialName: string;
}

export interface ClosingPortalTopUser {
  accountId: string;
  accountName: string;
  contactName: string;
  isProspect: boolean;
  totalLogins: number;
  totalQuoteViews: number;
  lastAccessAt: Date | null;
}

export interface HubClosingSectionProps {
  perms: HubPerms;
  closingData: ClosingHubData;
  sellerFirstName: string;
}
