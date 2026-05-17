'use client';

import { Wallet, FileText, Clock, FileEdit, FileText as FileTextDraft, Target } from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import { formatCompactCLP } from '../_lib/hub-utils';
import type {
  ClosingHubData,
  FinanceMetrics,
  FinanceCaps,
  HubPerms,
} from '../_lib/hub-types';

interface Props {
  closingData: ClosingHubData | null;
  financeMetrics: FinanceMetrics | null;
  financeCaps: FinanceCaps;
  hubPerms: HubPerms;
}

/**
 * Banda destacada "Pulso Cierre" — 6 KPIs críticos en grid 3×2 (móvil)
 * sin scroll horizontal. Combina tesorería (Caja, Facturas emitidas,
 * Por cobrar) con pipeline comercial (Leads borrador, CPQ borrador,
 * En negociación).
 *
 * Gating por card: cada KPI se omite si el usuario no tiene la
 * capability/submódulo correspondiente. Si quedan 0 cards, el
 * componente padre debe decidir no renderizar (ver HubClientWrapper).
 *
 * Permisos por card:
 *  - Caja              → financeCaps.banking_view  + caja !== null
 *  - Facturas emitidas → financeCaps.purchases_view + dteMes !== null
 *  - Por cobrar        → financeCaps.purchases_view + porCobrar !== null
 *  - Leads borrador    → hubPerms.canOpenLeads  + closingData
 *  - CPQ borrador      → hubPerms.canOpenQuotes + closingData
 *  - En negociación    → hubPerms.canOpenDeals  + closingData
 *
 * El monto detallado (sin compactar) se expone en el tooltip de cada
 * card financiera para que el ejecutivo pueda inspeccionar el dato
 * exacto sin abandonar el Hub.
 */
export function HubPulsoCierre({
  closingData,
  financeMetrics,
  financeCaps,
  hubPerms,
}: Props) {
  const showCaja =
    financeCaps.banking_view && financeMetrics?.caja != null;
  const showFactEmit =
    financeCaps.purchases_view && financeMetrics?.dteMes != null;
  const showPorCobrar =
    financeCaps.purchases_view && financeMetrics?.porCobrar != null;

  const showLeadsDraft =
    hubPerms.canOpenLeads && closingData != null;
  const showQuotesDraft =
    hubPerms.canOpenQuotes && closingData != null;
  const showDealsNegotiating =
    hubPerms.canOpenDeals && closingData != null;

  const totalCards =
    Number(showCaja) +
    Number(showFactEmit) +
    Number(showPorCobrar) +
    Number(showLeadsDraft) +
    Number(showQuotesDraft) +
    Number(showDealsNegotiating);

  if (totalCards === 0) return null;

  const fmtFullCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
    }).format(n);

  return (
    <section aria-label="Pulso de cierre" className="space-y-2">
      <div className="grid grid-cols-3 gap-2 md:gap-3 lg:grid-cols-6">
        {showCaja && financeMetrics?.caja && (
          <HubKpiLinkCard
            href="/finanzas/bancos"
            title="Caja"
            value={formatCompactCLP(financeMetrics.caja.totalClp)}
            icon={<Wallet />}
            description={
              financeMetrics.caja.staleDays > 7
                ? `Hace ${financeMetrics.caja.staleDays === 999 ? '?' : financeMetrics.caja.staleDays}d`
                : 'Hoy'
            }
            variant="emerald"
            titleInfoTooltip={`Saldo total: ${fmtFullCLP(financeMetrics.caja.totalClp)} · ${financeMetrics.caja.perAccount.length} cuenta(s)`}
            alert={financeMetrics.caja.staleDays > 7}
          />
        )}

        {showFactEmit && financeMetrics?.dteMes && (
          <HubKpiLinkCard
            href="/finanzas/facturacion/dtes"
            title={`Fact. emit. · ${financeMetrics.dteMes.periodLabel}`}
            value={formatCompactCLP(financeMetrics.dteMes.emitidasAmount)}
            icon={<FileText />}
            description={`${financeMetrics.dteMes.emitidasCount} docs`}
            variant="blue"
            titleInfoTooltip={`Monto del mes: ${fmtFullCLP(financeMetrics.dteMes.emitidasAmount)}`}
          />
        )}

        {showPorCobrar && financeMetrics?.porCobrar && (
          <HubKpiLinkCard
            href="/finanzas/facturacion/dtes"
            title="Por cobrar"
            value={formatCompactCLP(financeMetrics.porCobrar.totalAmount)}
            icon={<Clock />}
            description={
              financeMetrics.porCobrar.vencidoCount > 0
                ? `${financeMetrics.porCobrar.vencidoCount} vencidas`
                : `${financeMetrics.porCobrar.count} facturas`
            }
            variant={financeMetrics.porCobrar.vencidoCount > 0 ? 'amber' : 'sky'}
            titleInfoTooltip={`Total: ${fmtFullCLP(financeMetrics.porCobrar.totalAmount)} · Vencido: ${fmtFullCLP(financeMetrics.porCobrar.vencidoAmount)}`}
            alert={financeMetrics.porCobrar.vencidoCount > 0}
          />
        )}

        {showLeadsDraft && closingData && (
          <HubKpiLinkCard
            href="/crm/leads"
            title="Leads borrador"
            value={closingData.kpis.leadsDraftCount}
            icon={<FileEdit />}
            description="Sin trabajar"
            variant="indigo"
          />
        )}

        {showQuotesDraft && closingData && (
          <HubKpiLinkCard
            href="/crm/cotizaciones"
            title="CPQ borrador"
            value={closingData.kpis.quotesDraftCount}
            icon={<FileTextDraft />}
            description="Sin enviar"
            variant="amber"
          />
        )}

        {showDealsNegotiating && closingData && (
          <HubKpiLinkCard
            href="/crm/deals"
            title="En negociación"
            value={closingData.kpis.dealsNegotiatingCount}
            icon={<Target />}
            description={
              closingData.kpis.amountNegotiatingUf > 0
                ? `${Math.round(closingData.kpis.amountNegotiatingUf)} UF`
                : 'Sin monto'
            }
            variant="purple"
          />
        )}
      </div>
    </section>
  );
}
