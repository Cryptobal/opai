'use client';

import Link from 'next/link';
import { FileEdit, FileText, Target, ChevronRight } from 'lucide-react';
import { formatCLP } from '../_lib/hub-utils';
import type { ClosingHubKpis } from '../_lib/hub-types';

interface Props {
  kpis: ClosingHubKpis;
}

interface KpiLinkDef {
  label: string;
  getValue: (k: ClosingHubKpis) => string | number;
  getSub: (k: ClosingHubKpis) => string | null;
  href: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const KPI_LINKS: KpiLinkDef[] = [
  {
    label: 'Leads borrador',
    getValue: (k) => k.leadsDraftCount,
    getSub: () => 'Pendientes / en revisión',
    href: '/crm/leads',
    color: 'text-blue-400',
    Icon: FileEdit,
  },
  {
    label: 'CPQ borrador',
    getValue: (k) => k.quotesDraftCount,
    getSub: () => 'Cotizaciones sin enviar',
    href: '/crm/cotizaciones',
    color: 'text-amber-400',
    Icon: FileText,
  },
  {
    label: 'En negociación',
    getValue: (k) => k.dealsNegotiatingCount,
    getSub: (k) => (k.amountNegotiatingUf > 0 ? `${Math.round(k.amountNegotiatingUf)} UF` : null),
    href: '/crm/deals',
    color: 'text-teal-400',
    Icon: Target,
  },
];

export function HubClosingKpis({ kpis }: Props) {
  return (
    <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-1 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible md:pb-0">
      {KPI_LINKS.map((kpi) => {
        const value = kpi.getValue(kpis);
        const sub = kpi.getSub(kpis);
        const Icon = kpi.Icon;
        return (
          <Link
            key={kpi.label}
            href={kpi.href}
            className={`snap-center shrink-0 w-[140px] md:w-auto md:shrink block rounded-[10px] border border-border bg-card px-3.5 py-3 transition-colors hover:bg-accent/30 hover:border-accent/50`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {kpi.label}
              </span>
              <span className="flex items-center gap-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
                <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
              </span>
            </div>
            <p className={`text-2xl font-bold tabular-nums leading-tight ${kpi.color}`}>
              {value}
            </p>
            {sub && (
              <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
