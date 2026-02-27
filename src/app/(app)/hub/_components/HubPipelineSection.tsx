import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight,
  TrendingUp,
  Users,
  FileText,
  Target,
  ShieldCheck,
} from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubCompactStat } from './HubCompactStat';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import {
  formatCLP,
  formatPersonName,
  getScheduleState,
  formatScheduleDate,
} from '../_lib/hub-utils';
import type { CrmMetrics, DocsSignals, HubPerms } from '../_lib/hub-types';

interface HubPipelineSectionProps {
  perms: HubPerms;
  crmMetrics: CrmMetrics;
  docsSignals: DocsSignals | null;
}

export function HubPipelineSection({
  perms,
  crmMetrics,
  docsSignals,
}: HubPipelineSectionProps) {
  const now = new Date();
  const negotiationFormatted = formatCLP(Math.round(crmMetrics.amountInNegotiationClp));

  return (
    <HubCollapsibleSection
      icon={<TrendingUp className="h-4 w-4" />}
      title="Pipeline Comercial"
      badge={
        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
          {negotiationFormatted} negociando
        </Badge>
      }
      defaultOpen
    >
      {/* Funnel horizontal */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Embudo 30 dias
        </p>
        <div className="flex items-stretch gap-0 overflow-x-auto">
          {crmMetrics.funnel.map((step, idx) => {
            const stepColors = ['bg-sky-500', 'bg-blue-500', 'bg-purple-500', 'bg-emerald-500'];
            return (
              <Link
                key={step.label}
                href={step.href}
                className="group relative flex-1 min-w-[80px] rounded-lg border border-border bg-card p-3 transition-all hover:bg-accent/40 overflow-hidden"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 ${stepColors[idx % stepColors.length]}`} />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                  {step.label}
                </p>
                <p className="mt-1 text-xl font-bold">{step.value}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {step.rateFromPrev == null
                    ? 'Base del periodo'
                    : `${step.rateFromPrev}% conv.`}
                </p>
                {idx < crmMetrics.funnel.length - 1 && (
                  <ChevronRight className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3 w-3 text-muted-foreground/30 z-10" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* KPI Cards 2-col grid */}
      <div className="grid grid-cols-2 gap-3">
        <HubKpiLinkCard
          href="/crm/leads"
          title="Leads abiertos"
          value={crmMetrics.leadsOpenCount}
          icon={<Users className="h-4 w-4" />}
          description={`${crmMetrics.leadsCreated30} nuevos / 30d`}
          variant="sky"
        />
        <HubKpiLinkCard
          href="/crm/leads?status=borrador"
          title="En borrador"
          value={crmMetrics.leadsDraftCount}
          icon={<FileText className="h-4 w-4" />}
          description="Leads"
          variant="default"
        />
        <HubKpiLinkCard
          href="/crm/deals?etapa=negociando"
          title="Negociando"
          value={crmMetrics.dealsNegotiatingCount}
          icon={<Target className="h-4 w-4" />}
          description={`${negotiationFormatted} · ${Math.round(crmMetrics.amountInNegotiationUf)} UF`}
          variant="purple"
        />
        <HubKpiLinkCard
          href="/crm/deals?view=guardias"
          title="Guardias negociacion"
          value={crmMetrics.guardsInNegotiation}
          icon={<ShieldCheck className="h-4 w-4" />}
          description="En negociacion"
          variant="blue"
        />
      </div>

      {/* Engagement de propuestas */}
      {docsSignals && (
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Engagement de propuestas
          </p>
          <div className="grid grid-cols-3 gap-2">
            <HubCompactStat label="Enviadas" value={docsSignals.sent30} />
            <HubCompactStat label="Abiertas" value={docsSignals.viewed30} />
            <HubCompactStat label="Tasa apertura" value={`${docsSignals.viewRate30}%`} />
          </div>
          <Link
            href="/opai/inicio"
            className="mt-2 block text-[10px] font-medium text-primary hover:underline"
          >
            Ver detalle de documentos y trazabilidad de envios
          </Link>
        </div>
      )}

      {/* Seguimientos proximos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold">Proximos seguimientos</p>
          {perms.canConfigureCrm && (
            <Link
              href="/opai/configuracion/crm#seguimientos-automaticos"
              className="text-[10px] font-medium text-primary hover:underline"
            >
              Configurar
              <ChevronRight className="inline h-3 w-3" />
            </Link>
          )}
        </div>
        {crmMetrics.followUpQueue.length > 0 ? (
          <div className="space-y-1.5">
            {crmMetrics.followUpQueue.slice(0, 5).map((log) => {
              const scheduleState = getScheduleState(log.scheduledAt, now);
              const contactName = formatPersonName(
                log.deal.primaryContact?.firstName,
                log.deal.primaryContact?.lastName,
              );
              return (
                <Link
                  key={log.id}
                  href={`/crm/deals/${log.deal.id}`}
                  className="flex items-start gap-2 rounded-lg border border-border p-2.5 transition-colors hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {log.deal.account?.name || 'Cuenta sin nombre'}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {log.deal.title} | {contactName}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {formatScheduleDate(log.scheduledAt)} &middot; Seguimiento #{log.sequence}
                    </p>
                  </div>
                  <Badge variant="outline" className={scheduleState.className}>
                    {scheduleState.label}
                  </Badge>
                </Link>
              );
            })}
            {crmMetrics.followUpQueue.length > 5 && (
              <Link
                href="/crm/deals?focus=followup-open"
                className="block text-center text-[10px] font-medium text-primary hover:underline py-1"
              >
                Ver todos
                <ChevronRight className="inline h-3 w-3" />
              </Link>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-2">
            No hay seguimientos pendientes.
          </p>
        )}
      </div>
    </HubCollapsibleSection>
  );
}
