import Link from 'next/link';
import { Wallet, ClipboardCheck, Banknote, Receipt } from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { formatCLP } from '../_lib/hub-utils';
import type { FinanceMetrics, OpsMetrics } from '../_lib/hub-types';

interface HubFinanzasSectionProps {
  financeMetrics: FinanceMetrics;
  opsMetrics: OpsMetrics | null;
}

export function HubFinanzasSection({ financeMetrics, opsMetrics }: HubFinanzasSectionProps) {
  return (
    <HubCollapsibleSection
      icon={<Wallet className="h-4 w-4" />}
      title="Finanzas & Rendiciones"
    >
      <div className="grid grid-cols-2 gap-3">
        <HubKpiLinkCard
          href="/finanzas/rendiciones?status=pendiente"
          title="Pend. aprobacion"
          value={financeMetrics.pendingApprovalCount}
          icon={<ClipboardCheck className="h-4 w-4" />}
          description={`${formatCLP(financeMetrics.pendingApprovalAmount)} en total`}
          variant="amber"
        />
        <HubKpiLinkCard
          href="/finanzas/rendiciones?status=aprobada"
          title="Aprobadas sin pagar"
          value={financeMetrics.approvedUnpaidCount}
          icon={<Banknote className="h-4 w-4" />}
          description={`${formatCLP(financeMetrics.approvedUnpaidAmount)} en total`}
          variant="emerald"
        />
        {opsMetrics && opsMetrics.refuerzosPendientesFacturarCount > 0 && (
          <HubKpiLinkCard
            href="/ops/refuerzos?facturar=true"
            title="Pend. facturar refuerzo"
            value={formatCLP(Math.round(opsMetrics.refuerzosPendientesFacturarAmount))}
            icon={<Receipt className="h-4 w-4" />}
            description={`${opsMetrics.refuerzosPendientesFacturarCount} solicitud(es)`}
            variant="amber"
            alert
          />
        )}
      </div>

      <Link
        href="/finanzas"
        className="block text-xs font-medium text-primary hover:underline"
      >
        Ir a Finanzas
      </Link>
    </HubCollapsibleSection>
  );
}
