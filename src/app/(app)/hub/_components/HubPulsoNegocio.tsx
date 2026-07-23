'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Wallet, Clock, FileText, TrendingUp, ShieldCheck, Ticket,
} from 'lucide-react';
import { Stat } from '@/components/opai-ds';
import { cn } from '@/lib/utils';
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

/** KPIs visibles en móvil antes de "Ver todos los indicadores". */
const MOBILE_VISIBLE_KPIS = 4;

/**
 * Banda destacada "Pulso del negocio" — hasta 6 KPIs críticos del día.
 *
 * Layout: 2 columnas en móvil (320–430 px, sin scroll horizontal) con máximo
 * 4 KPIs visibles y revelado progresivo ("Ver todos los indicadores");
 * 6 columnas en desktop ≥ lg con todos los KPIs.
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
  const [showAll, setShowAll] = useState(false);

  const showCaja = financeCaps.banking_view && financeMetrics?.caja != null;
  const showPorCobrar =
    financeCaps.purchases_view && financeMetrics?.porCobrar != null;
  const showFactMes =
    financeCaps.purchases_view && financeMetrics?.dteMes != null;

  const showUfNegoc = hubPerms.canOpenDeals && closingData != null;
  const showCobertura = hubPerms.hasOps && opsMetrics != null;

  const caja = financeMetrics?.caja;
  const porCobrar = financeMetrics?.porCobrar;
  const dteMes = financeMetrics?.dteMes;
  const ufNegoc = closingData?.kpis.amountNegotiatingUf ?? 0;
  const dealsCount = closingData?.kpis.dealsNegotiatingCount ?? 0;
  const cobertura = opsMetrics?.attendance.coveragePercent ?? 0;
  const ticketsActivos =
    ticketMetrics.openCount + ticketMetrics.inProgressCount;

  const statClass = 'h-full cursor-pointer hover:ring-2 hover:ring-primary/25';
  const cards: { key: string; el: React.ReactNode }[] = [];

  if (showCaja && caja) {
    cards.push({
      key: 'caja',
      el: (
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
            className={statClass}
          />
        </Link>
      ),
    });
  }

  if (showPorCobrar && porCobrar) {
    cards.push({
      key: 'por-cobrar',
      el: (
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
            className={statClass}
          />
        </Link>
      ),
    });
  }

  if (showFactMes && dteMes) {
    cards.push({
      key: 'fact-mes',
      el: (
        <Link href="/finanzas/facturacion/dtes" className="block h-full">
          <Stat
            label={`Fact. ${dteMes.periodLabel}`}
            value={formatCompactCLP(dteMes.emitidasAmount)}
            hint={`${dteMes.emitidasCount} docs`}
            icon={FileText}
            variant="ok"
            className={statClass}
          />
        </Link>
      ),
    });
  }

  if (showUfNegoc) {
    cards.push({
      key: 'uf-negoc',
      el: (
        <Link href="/crm/deals" className="block h-full">
          <Stat
            label="UF negociando"
            value={fmtUF(ufNegoc)}
            hint={dealsCount > 0 ? `${dealsCount} deals` : 'Sin deals'}
            icon={TrendingUp}
            variant="brand"
            className={statClass}
          />
        </Link>
      ),
    });
  }

  if (showCobertura) {
    cards.push({
      key: 'cobertura',
      el: (
        <Link href="/ops/pauta-diaria" className="block h-full">
          <Stat
            label="Cobertura hoy"
            value={`${cobertura}%`}
            icon={ShieldCheck}
            variant={cobertura >= 95 ? 'ok' : cobertura >= 80 ? 'warn' : 'danger'}
            className={statClass}
          />
        </Link>
      ),
    });
  }

  cards.push({
    key: 'tickets',
    el: (
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
          className={statClass}
        />
      </Link>
    ),
  });

  if (cards.length === 0) return null;

  return (
    <div className="min-w-0 space-y-2">
      <div
        className="grid min-w-0 grid-cols-2 gap-2 md:gap-3 lg:grid-cols-6"
        aria-label="Pulso del negocio"
      >
        {cards.map((card, idx) => (
          <div
            key={card.key}
            className={cn(
              'min-w-0 h-full',
              // En móvil solo los primeros 4 hasta que el usuario revele el
              // resto; en desktop siempre se muestran todos.
              idx >= MOBILE_VISIBLE_KPIS && !showAll && 'hidden lg:block',
            )}
          >
            {card.el}
          </div>
        ))}
      </div>
      {cards.length > MOBILE_VISIBLE_KPIS && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="min-h-11 w-full rounded-ds-md text-[13px] font-medium text-primary transition-colors hover:bg-ds-surface-2 lg:hidden"
        >
          Ver todos los indicadores ({cards.length})
        </button>
      )}
    </div>
  );
}
