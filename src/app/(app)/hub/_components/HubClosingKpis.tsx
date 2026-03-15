import { Users, Target, Trophy, FileEdit, Eye, type LucideIcon } from 'lucide-react';
import { formatCLP } from '../_lib/hub-utils';
import type { ClosingHubKpis } from '../_lib/hub-types';

interface Props {
  kpis: ClosingHubKpis;
}

interface KpiDef {
  label: string;
  getValue: (k: ClosingHubKpis) => string | number;
  getSub: (k: ClosingHubKpis) => string | null;
  color: string;
  Icon: LucideIcon;
  hideMobile?: boolean;
}

const KPIS: KpiDef[] = [
  {
    label: 'Leads abiertos',
    getValue: (k) => k.openLeadsCount,
    getSub: (k) => `${k.newLeads30} nuevos / 30d`,
    color: 'text-blue-400',
    Icon: Users,
  },
  {
    label: 'En negociación',
    getValue: (k) => k.dealsNegotiatingCount,
    getSub: (k) => `${Math.round(k.amountNegotiatingUf)} UF`,
    color: 'text-amber-400',
    Icon: Target,
  },
  {
    label: 'Ganados 30d',
    getValue: (k) => k.closedWon30,
    getSub: () => null,
    color: 'text-emerald-400',
    Icon: Trophy,
  },
  {
    label: 'Borradores',
    getValue: (k) => k.quotesDraftCount,
    getSub: () => 'Cotizaciones sin enviar',
    color: 'text-amber-400',
    Icon: FileEdit,
  },
  {
    label: 'Apertura propuestas',
    getValue: (k) => `${k.proposalViewRate30}%`,
    getSub: (k) => `${k.proposalsViewed30}/${k.proposalsSent30} vistas / 30d`,
    color: 'text-teal-400',
    Icon: Eye,
    hideMobile: true,
  },
];

export function HubClosingKpis({ kpis }: Props) {
  return (
    <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-1 md:grid md:grid-cols-5 md:gap-3 md:overflow-visible md:pb-0">
      {KPIS.map((kpi) => {
        const value = kpi.getValue(kpis);
        const sub = kpi.getSub(kpis);
        return (
          <div
            key={kpi.label}
            className={`snap-center shrink-0 w-[140px] md:w-auto md:shrink ${kpi.hideMobile ? 'hidden md:block' : ''}`}
          >
            <div className="rounded-[10px] border border-border bg-card px-3.5 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {kpi.label}
                </span>
                <kpi.Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
              </div>
              <p className={`text-[22px] font-bold tabular-nums leading-tight ${kpi.color}`}>
                {value}
              </p>
              {sub && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
