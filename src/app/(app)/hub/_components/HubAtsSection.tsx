import { Briefcase, Users2, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import type { AtsMetrics } from '../_lib/hub-types';

interface HubAtsSectionProps {
  metrics: AtsMetrics;
}

export function HubAtsSection({ metrics }: HubAtsSectionProps) {
  return (
    <HubCollapsibleSection
      icon={<Briefcase className="h-4 w-4" />}
      title="Reclutamiento (ATS)"
      badge={
        <Badge variant="outline" className="text-[10px]">
          {metrics.openJobs} vacantes
        </Badge>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <HubKpiLinkCard
          href="/ops/ats"
          title="Vacantes abiertas"
          value={metrics.openJobs}
          icon={<Briefcase className="h-4 w-4" />}
          variant="blue"
        />
        <HubKpiLinkCard
          href="/ops/ats?filter=recent"
          title="Postulaciones 7d"
          value={metrics.recentApplications}
          icon={<Mail className="h-4 w-4" />}
          variant="teal"
          description="Últimos 7 días"
        />
        <HubKpiLinkCard
          href="/ops/ats?filter=in_process"
          title="En proceso"
          value={metrics.inProcess}
          icon={<Users2 className="h-4 w-4" />}
          variant="amber"
          description="Revisión / entrevistas"
        />
      </div>
    </HubCollapsibleSection>
  );
}
