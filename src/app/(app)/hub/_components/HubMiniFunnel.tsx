import { ChevronRight } from 'lucide-react';
import type { ClosingFunnel } from '../_lib/hub-types';

interface Props {
  funnel: ClosingFunnel;
}

const STEPS = [
  { key: 'leadsCreated', label: 'Leads', color: '#3b82f6' },
  { key: 'leadsConverted', label: 'Convertidos', color: '#8b5cf6' },
  { key: 'proposalsSent', label: 'Propuestas', color: '#2DD4A0' },
  { key: 'dealsWon', label: 'Ganados', color: '#10b981' },
] as const;

export function HubMiniFunnel({ funnel }: Props) {
  const max = Math.max(funnel.leadsCreated, 1);

  return (
    <div className="rounded-[10px] border border-border bg-card p-3.5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
        Embudo 30 días
      </p>
      <div className="space-y-2.5">
        {STEPS.map((step, idx) => {
          const value = funnel[step.key];
          const pct = Math.max((value / max) * 100, 4);
          const conversionLabel =
            idx === 1
              ? `${funnel.leadToDealRate}%`
              : idx === 3
                ? `${funnel.proposalToWonRate}%`
                : null;

          return (
            <div key={step.key}>
              {conversionLabel && (
                <div className="flex items-center justify-center mb-1 -mt-0.5">
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                    <ChevronRight className="h-2.5 w-2.5 rotate-90" />
                    <span>conv. {conversionLabel}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-20 shrink-0 text-right">
                  {step.label}
                </span>
                <div className="flex-1 h-5 bg-muted/30 rounded-md overflow-hidden relative">
                  <div
                    className="h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: step.color,
                    }}
                  >
                    <span className="text-[10px] font-bold tabular-nums text-white drop-shadow">
                      {value}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
