import { Calculator, Calendar, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import type { PayrollMetrics } from '../_lib/hub-types';

interface HubPayrollSectionProps {
  metrics: PayrollMetrics;
}

const dateFmt = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: 'short',
});

export function HubPayrollSection({ metrics }: HubPayrollSectionProps) {
  const periodLabel = metrics.currentPeriodLabel ?? 'Sin período';
  const nextCloseLabel = metrics.nextCloseDate
    ? dateFmt.format(new Date(metrics.nextCloseDate))
    : '—';

  return (
    <HubCollapsibleSection
      icon={<Calculator className="h-4 w-4" />}
      title="Payroll"
      badge={
        <Badge variant="outline" className="text-[10px]">
          {periodLabel}
        </Badge>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <HubKpiLinkCard
          href="/payroll"
          title="Período activo"
          value={periodLabel}
          icon={<Calendar className="h-4 w-4" />}
          variant="blue"
          description={metrics.currentPeriodStatus ?? undefined}
        />
        <HubKpiLinkCard
          href="/payroll/anticipos"
          title="Anticipos pendientes"
          value={metrics.pendingAnticipos}
          icon={<Wallet className="h-4 w-4" />}
          variant={metrics.pendingAnticipos > 0 ? 'amber' : 'default'}
        />
        <HubKpiLinkCard
          href="/payroll"
          title="Próximo cierre"
          value={nextCloseLabel}
          icon={<Calendar className="h-4 w-4" />}
          variant="teal"
        />
      </div>
    </HubCollapsibleSection>
  );
}
