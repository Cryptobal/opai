import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Send,
  Target,
  Users,
} from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubCompactStat } from './HubCompactStat';
import {
  formatPersonName,
  formatLeadSource,
  getScheduleState,
  formatScheduleDate,
} from '../_lib/hub-utils';
import type { HubCrmSectionProps } from '../_lib/hub-types';

export function HubCrmSection({
  perms,
  crmMetrics,
  docsSignals,
  financeMetrics,
}: HubCrmSectionProps) {
  const now = new Date();

  return (
    <>
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <HubKpiLinkCard
          href="/crm/leads?status=pending"
          title="Leads Abiertos"
          value={crmMetrics.pendingLeadsCount}
          icon={<Users className="h-4 w-4" />}
          description={`${crmMetrics.leadsCreated30} nuevos en 30 días`}
          variant="sky"
        />
        <HubKpiLinkCard
          href="/crm/leads?status=approved"
          title="Conv. Lead → Negocio"
          value={`${crmMetrics.leadToDealRate30}%`}
          icon={<Target className="h-4 w-4" />}
          trend={
            crmMetrics.leadToDealRate30 >= 35
              ? 'up'
              : crmMetrics.leadToDealRate30 >= 20
                ? 'neutral'
                : 'down'
          }
          trendValue={`${crmMetrics.leadsConverted30}/${crmMetrics.leadsCreated30} en 30 días`}
          variant="teal"
          titleInfoTooltip="Leads creados en 30 días que terminaron convertidos a negocio."
        />
        <HubKpiLinkCard
          href="/crm/deals?focus=proposals-sent-30d"
          title="Propuestas Enviadas"
          value={crmMetrics.proposalsSent30}
          icon={<Send className="h-4 w-4" />}
          description="Últimos 30 días"
          variant="blue"
        />
        <HubKpiLinkCard
          href="/crm/deals?focus=won-after-proposal-30d"
          title="Tasa Propuesta → Ganado"
          value={`${crmMetrics.proposalToWonRate30}%`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          trend={
            crmMetrics.proposalToWonRate30 >= 25
              ? 'up'
              : crmMetrics.proposalToWonRate30 >= 10
                ? 'neutral'
                : 'down'
          }
          trendValue={`${crmMetrics.wonDealsWithProposal30}/${crmMetrics.proposalsSent30} en 30 días`}
          variant="emerald"
          titleInfoTooltip="Negocios movidos a etapa ganada en 30 días, sobre propuestas enviadas en el mismo período."
        />
        <HubKpiLinkCard
          href="/crm/deals?focus=followup-open"
          title="Negocios en Seguimiento"
          value={crmMetrics.openDealsInFollowUpCount}
          icon={<BriefcaseBusiness className="h-4 w-4" />}
          description={`${crmMetrics.followUpCoverageRate}% con seguimiento activo`}
          variant="purple"
        />
        <HubKpiLinkCard
          href="/crm/deals?focus=followup-overdue"
          title="Seguimientos Vencidos"
          value={crmMetrics.followUpsOverdueCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={crmMetrics.followUpsOverdueCount > 0 ? 'down' : 'up'}
          trendValue={
            crmMetrics.followUpsFailed30 > 0
              ? `${crmMetrics.followUpsFailed30} fallidos en 30 días`
              : 'Sin fallos recientes'
          }
          variant={crmMetrics.followUpsOverdueCount > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Embudo comercial (30 días)
          </CardTitle>
          <CardDescription>
            Conversión de leads hacia propuestas y cierre de negocios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {crmMetrics.funnel.map((step, idx) => {
              const stepColors = ['bg-sky-500', 'bg-blue-500', 'bg-purple-500', 'bg-emerald-500'];
              return (
                <Link
                  key={step.label}
                  href={step.href}
                  className="group rounded-lg border border-border bg-card p-3 transition-all hover:bg-accent/40 hover:shadow-sm relative overflow-hidden"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${stepColors[idx % stepColors.length]}`} />
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
                    {step.label}
                  </p>
                  {/* Intencional: funnel CRM con barra de color, no usa KpiCard por ser Link interactivo */}
                  <p className="mt-1 text-2xl font-bold">{step.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step.rateFromPrev == null
                      ? 'Base del periodo'
                      : (
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium text-foreground">{step.rateFromPrev}%</span> desde etapa anterior
                        </span>
                      )}
                  </p>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Leads + Follow-ups */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Open leads */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads abiertos</CardTitle>
            <CardDescription>
              Prospectos pendientes de revisar y aprobar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {crmMetrics.openLeads.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hay leads pendientes.
              </div>
            ) : (
              <div className="space-y-2">
                {crmMetrics.openLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href="/crm/leads"
                    className="block rounded-lg border border-border p-3 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {lead.companyName?.trim() || 'Empresa sin nombre'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatPersonName(lead.firstName, lead.lastName)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground/80">
                          {lead.email || 'Sin email'}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {timeAgo(lead.createdAt)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px]">
                        {formatLeadSource(lead.source)}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        Revisar
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                Seguimiento de negocios
              </CardTitle>
              {perms.canConfigureCrm && (
                <Link
                  href="/opai/configuracion/crm#seguimientos-automaticos"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Configurar seguimientos automáticos (1, 2 y 3)
                </Link>
              )}
            </div>
            <CardDescription>
              {crmMetrics.overdueFollowUps.length > 0
                ? 'Priorizando seguimientos vencidos y para hoy.'
                : 'Próximos seguimientos programados.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {crmMetrics.followUpQueue.length > 0 ? (
              <div className="space-y-2">
                {crmMetrics.followUpQueue.map((log) => {
                  const scheduleState = getScheduleState(log.scheduledAt, now);
                  const contactName = formatPersonName(
                    log.deal.primaryContact?.firstName,
                    log.deal.primaryContact?.lastName,
                  );

                  return (
                    <Link
                      key={log.id}
                      href={`/crm/deals/${log.deal.id}`}
                      className="block rounded-lg border border-border p-3 transition-colors hover:bg-accent/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {log.deal.account?.name || 'Cuenta sin nombre'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {log.deal.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground/80">
                            {contactName}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={scheduleState.className}
                        >
                          {scheduleState.label}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {formatScheduleDate(log.scheduledAt)} · Seguimiento #
                          {log.sequence}
                        </span>
                        <span className="inline-flex items-center gap-1 text-primary">
                          Abrir
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : crmMetrics.dealsWithoutPendingFollowUp.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-500">
                  Hay {crmMetrics.dealsWithoutPendingFollowUpCount} negocios con
                  propuesta enviada sin seguimiento pendiente.
                </p>
                {crmMetrics.dealsWithoutPendingFollowUp.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/crm/deals/${deal.id}`}
                    className="block rounded-lg border border-border p-3 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {deal.account?.name || 'Cuenta sin nombre'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {deal.title}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-amber-500/30 text-amber-500"
                      >
                        Sin seguimiento
                      </Badge>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Propuesta enviada{' '}
                      {deal.proposalSentAt
                        ? timeAgo(deal.proposalSentAt)
                        : 'sin fecha'}
                      .
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hay seguimientos pendientes.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Docs engagement (inline when CRM is present) */}
      {docsSignals && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              Engagement de propuestas (documentos)
            </CardTitle>
            <CardDescription>
              Señales de apertura para priorizar seguimiento comercial.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HubCompactStat label="Enviadas" value={docsSignals.sent30} />
              <HubCompactStat label="Abiertas" value={docsSignals.viewed30} />
              <HubCompactStat label="Sin abrir" value={docsSignals.unread30} />
              <HubCompactStat
                label="Tasa de apertura"
                value={`${docsSignals.viewRate30}%`}
              />
            </div>
            <div>
              <Link
                href="/opai/inicio"
                className="text-xs font-medium text-primary hover:underline"
              >
                Ver detalle de documentos y trazabilidad de envíos
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
