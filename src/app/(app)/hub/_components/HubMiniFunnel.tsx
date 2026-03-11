import type { ClosingFunnel } from '../_lib/hub-types';

interface Props {
  funnel: ClosingFunnel;
}

const STEPS = [
  { key: 'leadsCreated', label: 'Leads', color: 'bg-blue-500', textColor: 'text-blue-400' },
  { key: 'leadsConverted', label: 'Convertidos', color: 'bg-violet-500', textColor: 'text-violet-400' },
  { key: 'proposalsSent', label: 'Propuestas', color: 'bg-teal-500', textColor: 'text-teal-400' },
  { key: 'dealsWon', label: 'Ganados', color: 'bg-emerald-500', textColor: 'text-emerald-400' },
] as const;

export function HubMiniFunnel({ funnel }: Props) {
  const max = Math.max(funnel.leadsCreated, 1);

  return (
    <div className="rounded-[10px] border border-border bg-card p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Embudo 30 días
      </p>
      <div className="grid grid-cols-4 gap-3">
        {STEPS.map((step) => {
          const value = funnel[step.key];
          const pct = Math.max((value / max) * 100, 6);
          return (
            <div key={step.key} className="text-center">
              <p className={`text-[22px] font-bold tabular-nums leading-tight ${step.textColor}`}>
                {value}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{step.label}</p>
              <div className="mt-1.5 h-1 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className={`h-full ${step.color} rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
        <span className="text-[10px] text-muted-foreground">
          Lead→Deal <span className="font-bold text-foreground">{funnel.leadToDealRate}%</span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          Prop→Ganado <span className="font-bold text-foreground">{funnel.proposalToWonRate}%</span>
        </span>
      </div>
    </div>
  );
}
