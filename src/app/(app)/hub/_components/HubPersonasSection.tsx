import { Users, FileWarning, AlarmClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubConocimientoMatrix } from './charts/HubConocimientoMatrix';
import { HubPersonasExtras } from './HubPersonasExtras';
import type { PersonasMetrics } from '../_lib/hub-types';

interface HubPersonasSectionProps {
  metrics: PersonasMetrics;
}

export function HubPersonasSection({ metrics }: HubPersonasSectionProps) {
  return (
    <HubCollapsibleSection
      icon={<Users className="h-4 w-4" />}
      title="Personas"
      badge={
        <Badge variant="outline" className="text-[10px]">
          {metrics.enOnboarding} en onboarding
        </Badge>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <HubKpiLinkCard
          href="/personas/guardias?filter=onboarding"
          title="En onboarding"
          value={metrics.enOnboarding}
          icon={<Users className="h-4 w-4" />}
          variant="blue"
        />
        <HubKpiLinkCard
          href="/personas/guardias?filter=docs_pending"
          title="Docs pendientes"
          value={metrics.documentacionPendiente}
          icon={<FileWarning className="h-4 w-4" />}
          variant={metrics.documentacionPendiente > 0 ? 'amber' : 'default'}
          alert={metrics.documentacionPendiente > 10}
        />
        <HubKpiLinkCard
          href="/personas/guardias?filter=contratos_por_vencer"
          title="Contratos por vencer"
          value={metrics.contratosPorVencer}
          icon={<AlarmClock className="h-4 w-4" />}
          variant={metrics.contratosPorVencer > 0 ? 'amber' : 'default'}
          description="30 días"
        />
      </div>

      {/* Postulantes semana + Cumpleaños */}
      <HubPersonasExtras />

      {/* Heatmap de conocimiento por instalación */}
      <div className="mt-4">
        <HubConocimientoMatrix />
      </div>
    </HubCollapsibleSection>
  );
}
