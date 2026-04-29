"use client";

import Link from 'next/link';
import {
  TrendingUp, Building2, Users, ShieldCheck, Ticket, FileSignature,
} from 'lucide-react';
import { KpiCard } from '@/components/opai/KpiCard';
import type { OpsMetrics, ClosingHubData, FinanceMetrics, TicketMetrics } from '../_lib/hub-types';

interface Props {
  closingData: ClosingHubData | null;
  opsMetrics: OpsMetrics | null;
  financeMetrics: FinanceMetrics | null;
  ticketMetrics: TicketMetrics;
  contratosPorVencer?: number;
  contratosVencidos?: number;
  installationsActivas?: number;
}

const fmtUF = (n: number) => `UF ${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n)}`;

export function HubExecutiveKpis({
  closingData,
  opsMetrics,
  ticketMetrics,
  contratosPorVencer = 0,
  contratosVencidos = 0,
  installationsActivas = 0,
}: Props) {
  const mrrUf = closingData?.kpis.amountNegotiatingUf ?? 0;
  const cobertura = opsMetrics?.attendance.coveragePercent ?? 0;
  const guardias = opsMetrics?.activeGuardias ?? 0;
  const ticketsActivos = ticketMetrics.openCount + ticketMetrics.inProgressCount;
  const totalContratosAlerta = contratosPorVencer + contratosVencidos;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
      <Link href="/crm/deals?status=open">
        <KpiCard
          title="UF en negociación"
          value={fmtUF(mrrUf)}
          icon={<TrendingUp className="h-4 w-4" />}
          variant="emerald"
          className="cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/crm/installations?status=active">
        <KpiCard
          title="Instalaciones activas"
          value={installationsActivas}
          icon={<Building2 className="h-4 w-4" />}
          variant="blue"
          className="cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/personas/guardias">
        <KpiCard
          title="Guardias activos"
          value={guardias}
          icon={<Users className="h-4 w-4" />}
          variant="sky"
          className="cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/ops/pauta-diaria">
        <KpiCard
          title="Cobertura hoy"
          value={`${cobertura}%`}
          icon={<ShieldCheck className="h-4 w-4" />}
          variant={cobertura >= 95 ? 'emerald' : cobertura >= 80 ? 'amber' : 'red'}
          className="cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/ops/tickets">
        <KpiCard
          title="Tickets activos"
          value={ticketsActivos}
          description={ticketMetrics.p1PendingCount > 0 ? `${ticketMetrics.p1PendingCount} P1 pendientes` : undefined}
          icon={<Ticket className="h-4 w-4" />}
          variant={ticketMetrics.p1PendingCount > 0 || ticketMetrics.breachedCount > 0 ? 'red' : 'default'}
          className="cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/crm/accounts">
        <KpiCard
          title="Contratos en alerta"
          value={totalContratosAlerta}
          description={contratosVencidos > 0 ? `${contratosVencidos} vencidos` : `${contratosPorVencer} por vencer`}
          icon={<FileSignature className="h-4 w-4" />}
          variant={contratosVencidos > 0 ? 'red' : contratosPorVencer > 0 ? 'amber' : 'default'}
          className="cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
    </div>
  );
}
