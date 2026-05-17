'use client';

import Link from 'next/link';
import {
  Wallet, Clock, FileText, TrendingUp, ShieldCheck, Ticket,
} from 'lucide-react';
import { Stat } from '@/components/opai-ds';
import { formatCompactCLP } from '../_lib/hub-utils';
import type {
  ClosingHubData,
  FinanceMetrics,
  FinanceCaps,
  OpsMetrics,
  TicketMetrics,
  HubPerms,
} from '../_lib/hub-types';

const fmtUF = (n: number) =>
  `UF ${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n)}`;

interface Props {
  hubPerms: HubPerms;
  closingData: ClosingHubData | null;
  opsMetrics: OpsMetrics | null;
  financeMetrics: FinanceMetrics | null;
  financeCaps: FinanceCaps;
  ticketMetrics: TicketMetrics;
}

/**
 * Banda destacada "Pulso del negocio" — 6 KPIs críticos del día.
 *
 * Layout: grid 3×2 en móvil (sin scroll horizontal), 6×1 en desktop ≥ lg.
 *
 * Composición (cuando todos los permisos están activos):
 *   Fila 1 (tesorería)  Caja        | Por cobrar  | Facturado mes
 *   Fila 2 (operación)  UF negoc.   | Cobertura   | Mis tickets
 *
 * Gating estricto por card (NO se renderiza si falta permiso):
 *   - Caja            → financeCaps.banking_view  + financeMetrics.caja
 *   - Por cobrar      → financeCaps.purchases_view + financeMetrics.porCobrar
 *   - Facturado mes   → financeCaps.purchases_view + financeMetrics.dteMes
 *   - UF negociación  → hubPerms.canOpenDeals + closingData
 *   - Cobertura hoy   → hubPerms.hasOps + opsMetrics
 *   - Mis tickets     → siempre (todos los roles ven tickets)
 *
 * Los datos sensibles (caja/dteMes/porCobrar) NO viajan al cliente si la
 * capability es false porque getFinanceMetrics no los calcula. Igual
 * validamos defensivamente acá para evitar renders vacíos.
 */
export function HubPulsoNegocio({
  hubPerms,
  closingData,
  opsMetrics,
  financeMetrics,
  financeCaps,
  ticketMetrics,
}: Props) {
  const showCaja = financeCaps.banking_view && financeMetrics?.caja != null;
  const showPorCobrar =
    financeCaps.purchases_view && financeMetrics?.porCobrar != null;
  const showFactMes =
    financeCaps.purchases_view && financeMetrics?.dteMes != null;

  const showUfNegoc = hubPerms.canOpenDeals && closingData != null;
  const showCobertura = hubPerms.hasOps && opsMetrics != null;
  const showTickets = true;

  const total =
    Number(showCaja) +
    Number(showPorCobrar) +
    Number(showFactMes) +
    Number(showUfNegoc) +
    Number(showCobertura) +
    Number(showTickets);

  if (total === 0) return null;

  const caja = financeMetrics?.caja;
  const porCobrar = financeMetrics?.porCobrar;
  const dteMes = financeMetrics?.dteMes;
  const ufNegoc = closingData?.kpis.amountNegotiatingUf ?? 0;
  const dealsCount = closingData?.kpis.dealsNegotiatingCount ?? 0;
  const cobertura = opsMetrics?.attendance.coveragePercent ?? 0;
  const ticketsActivos =
    ticketMetrics.openCount + ticketMetrics.inProgressCount;

  return (
    <div
      className="grid grid-cols-3 gap-2 md:gap-3 lg:grid-cols-6"
      aria-label="Pulso del negocio"
    >
      {showCaja && caja && (
        <Link href="/finanzas/bancos" className="block h-full">
          <Stat
            label="Caja"
            value={formatCompactCLP(caja.totalClp)}
            hint={
              caja.staleDays > 7
                ? `Hace ${caja.staleDays === 999 ? '?' : caja.staleDays}d`
                : 'Hoy'
            }
            icon={Wallet}
            variant={caja.staleDays > 7 ? 'warn' : 'ok'}
            className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
          />
        </Link>
      )}

      {showPorCobrar && porCobrar && (
        <Link href="/finanzas/facturacion/dtes" className="block h-full">
          <Stat
            label="Por cobrar"
            value={formatCompactCLP(porCobrar.totalAmount)}
            hint={
              porCobrar.vencidoCount > 0
                ? `${porCobrar.vencidoCount} vencidas`
                : `${porCobrar.count} facturas`
            }
            icon={Clock}
            variant={porCobrar.vencidoCount > 0 ? 'danger' : 'brand'}
            className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
          />
        </Link>
      )}

      {showFactMes && dteMes && (
        <Link href="/finanzas/facturacion/dtes" className="block h-full">
          <Stat
            label={`Fact. ${dteMes.periodLabel}`}
            value={formatCompactCLP(dteMes.emitidasAmount)}
            hint={`${dteMes.emitidasCount} docs`}
            icon={FileText}
            variant="ok"
            className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
          />
        </Link>
      )}

      {showUfNegoc && (
        <Link href="/crm/deals?status=open" className="block h-full">
          <Stat
            label="UF negociando"
            value={fmtUF(ufNegoc)}
            hint={dealsCount > 0 ? `${dealsCount} deals` : 'Sin deals'}
            icon={TrendingUp}
            variant="brand"
            className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
          />
        </Link>
      )}

      {showCobertura && (
        <Link href="/ops/pauta-diaria" className="block h-full">
          <Stat
            label="Cobertura hoy"
            value={`${cobertura}%`}
            icon={ShieldCheck}
            variant={cobertura >= 95 ? 'ok' : cobertura >= 80 ? 'warn' : 'danger'}
            className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
          />
        </Link>
      )}

      {showTickets && (
        <Link href="/ops/tickets?assignedTo=me" className="block h-full">
          <Stat
            label="Mis tickets"
            value={ticketMetrics.myAssignedActiveCount}
            hint={
              ticketMetrics.p1PendingCount > 0
                ? `${ticketsActivos} act · ${ticketMetrics.p1PendingCount} P1`
                : `${ticketsActivos} activos`
            }
            icon={Ticket}
            variant={
              ticketMetrics.p1PendingCount > 0 || ticketMetrics.breachedCount > 0
                ? 'danger'
                : ticketMetrics.myAssignedActiveCount > 0
                  ? 'brand'
                  : 'default'
            }
            className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
          />
        </Link>
      )}
    </div>
  );
}
