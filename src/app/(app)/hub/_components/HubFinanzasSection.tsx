import Link from 'next/link';
import {
  Wallet,
  ClipboardCheck,
  Banknote,
  Receipt,
  TrendingUp,
  TrendingDown,
  FileInput,
} from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { formatCLP } from '../_lib/hub-utils';
import type {
  FinanceMetrics,
  FinanceCaps,
  OpsMetrics,
} from '../_lib/hub-types';

interface HubFinanzasSectionProps {
  financeMetrics: FinanceMetrics;
  financeCaps: FinanceCaps;
  opsMetrics: OpsMetrics | null;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function HubFinanzasSection({
  financeMetrics,
  financeCaps,
  opsMetrics,
}: HubFinanzasSectionProps) {
  const { flujoSemana, dteMes } = financeMetrics;

  const flujoNetoNegative = flujoSemana ? flujoSemana.neto < 0 : false;

  return (
    <HubCollapsibleSection
      icon={<Wallet className="h-4 w-4" />}
      title="Finanzas"
    >
      <div className="grid grid-cols-2 gap-3">
        {financeCaps.cashflow_view && flujoSemana && (
          <HubKpiLinkCard
            href="/finanzas/flujo-caja"
            title={`Flujo semana ${formatShortDate(flujoSemana.weekStartIso)}–${formatShortDate(flujoSemana.weekEndIso)}`}
            value={formatCLP(flujoSemana.neto)}
            icon={
              flujoNetoNegative ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )
            }
            description={`Ingresos ${formatCLP(flujoSemana.ingresos)} · Egresos ${formatCLP(flujoSemana.egresos)}`}
            variant={flujoNetoNegative ? 'red' : 'emerald'}
          />
        )}
        {financeCaps.purchases_view && dteMes && (
          <HubKpiLinkCard
            href="/finanzas/facturacion/recibidos"
            title={`Facturas recibidas — ${dteMes.periodLabel}`}
            value={dteMes.recibidasCount}
            icon={<FileInput className="h-4 w-4" />}
            description={formatCLP(dteMes.recibidasAmount)}
            variant="sky"
          />
        )}

        {/* KPIs de rendiciones (preexistentes) — orden detrás de los nuevos. */}
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
