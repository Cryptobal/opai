"use client";

import Link from 'next/link';
import {
  TrendingUp, Building2, Users, ShieldCheck, Ticket, FileSignature,
} from 'lucide-react';
import { Stat } from '@/components/opai-ds';
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
      <Link href="/crm/deals?status=open" className="block h-full">
        <Stat
          label="UF en negociación"
          value={fmtUF(mrrUf)}
          icon={TrendingUp}
          variant="ok"
          className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/crm/installations?status=active" className="block h-full">
        <Stat
          label="Instalaciones activas"
          value={installationsActivas}
          icon={Building2}
          variant="brand"
          className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/personas/guardias" className="block h-full">
        <Stat
          label="Guardias activos"
          value={guardias}
          icon={Users}
          variant="brand"
          className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/ops/pauta-diaria" className="block h-full">
        <Stat
          label="Cobertura hoy"
          value={`${cobertura}%`}
          icon={ShieldCheck}
          variant={cobertura >= 95 ? 'ok' : cobertura >= 80 ? 'warn' : 'danger'}
          className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/ops/tickets" className="block h-full">
        <Stat
          label="Tickets activos"
          value={ticketsActivos}
          hint={ticketMetrics.p1PendingCount > 0 ? `${ticketMetrics.p1PendingCount} P1 pendientes` : undefined}
          icon={Ticket}
          variant={ticketMetrics.p1PendingCount > 0 || ticketMetrics.breachedCount > 0 ? 'danger' : 'default'}
          className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
      <Link href="/crm/accounts" className="block h-full">
        <Stat
          label="Contratos en alerta"
          value={totalContratosAlerta}
          hint={contratosVencidos > 0 ? `${contratosVencidos} vencidos` : `${contratosPorVencer} por vencer`}
          icon={FileSignature}
          variant={contratosVencidos > 0 ? 'danger' : contratosPorVencer > 0 ? 'warn' : 'default'}
          className="h-full cursor-pointer hover:ring-2 hover:ring-primary/25"
        />
      </Link>
    </div>
  );
}
