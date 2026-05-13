import Link from 'next/link';
import {
  Wallet,
  ClipboardCheck,
  Banknote,
  Receipt,
  TrendingUp,
  TrendingDown,
  FileText,
  FileInput,
  Clock,
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
  const { caja, flujoSemana, dteMes, porCobrar } = financeMetrics;

  // Tooltip Caja: lista compacta por banco como string flat (titleInfoTooltip
  // del DS sólo acepta string). Si hay >3 cuentas mostramos las 3 mayores y
  // un "+ N más" para no reventar el tooltip.
  const cajaTooltip = caja
    ? (() => {
        const sorted = [...caja.perAccount].sort(
          (a, b) => b.resolvedBalanceClp - a.resolvedBalanceClp,
        );
        const top = sorted.slice(0, 3).map(
          (a) => `${a.bankName} · ${a.accountNumber} · ${formatCLP(a.resolvedBalanceClp)}`,
        );
        const rest = sorted.length - 3;
        return rest > 0 ? `${top.join(' · ')} · +${rest} más` : top.join(' · ');
      })()
    : undefined;

  const cajaStaleLabel =
    caja && caja.staleDays > 7
      ? `Última cartola hace ${caja.staleDays === 999 ? '?' : caja.staleDays} días`
      : caja
        ? 'Actualizado hoy'
        : undefined;

  const flujoNetoNegative = flujoSemana ? flujoSemana.neto < 0 : false;

  return (
    <HubCollapsibleSection
      icon={<Wallet className="h-4 w-4" />}
      title="Finanzas"
    >
      <div className="grid grid-cols-2 gap-3">
        {financeCaps.banking_view && caja && (
          <HubKpiLinkCard
            href="/finanzas/bancos"
            title="Caja"
            value={formatCLP(caja.totalClp)}
            icon={<Wallet className="h-4 w-4" />}
            description={cajaStaleLabel}
            variant="emerald"
            titleInfoTooltip={cajaTooltip}
            alert={caja.staleDays > 7}
          />
        )}
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
            href="/finanzas/facturacion/dtes"
            title={`Facturas emitidas — ${dteMes.periodLabel}`}
            value={dteMes.emitidasCount}
            icon={<FileText className="h-4 w-4" />}
            description={formatCLP(dteMes.emitidasAmount)}
            variant="blue"
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
        {financeCaps.purchases_view && porCobrar && (
          <HubKpiLinkCard
            href="/finanzas/facturacion/dtes"
            title="Por cobrar"
            value={formatCLP(porCobrar.totalAmount)}
            icon={<Clock className="h-4 w-4" />}
            description={`${porCobrar.count} facturas${porCobrar.vencidoCount > 0 ? ` · ${porCobrar.vencidoCount} vencidas` : ''}`}
            variant={porCobrar.vencidoCount > 0 ? 'amber' : 'sky'}
            alert={porCobrar.vencidoCount > 0}
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
