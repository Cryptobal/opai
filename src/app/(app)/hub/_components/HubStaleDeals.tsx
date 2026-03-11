import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ClosingStaleDeal } from '../_lib/hub-types';

interface Props {
  deals: ClosingStaleDeal[];
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  const color = days > 30 ? 'text-red-400 border-red-500/30' : 'text-amber-400 border-amber-500/30';
  return (
    <span className={`text-[10px] font-bold tabular-nums border rounded px-1.5 py-0.5 ${color}`}>
      {days}d
    </span>
  );
}

export function HubStaleDeals({ deals }: Props) {
  if (deals.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground/50" />
          <p className="text-[13px] font-bold">Sin actividad</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Todos los negocios tienen actividad reciente.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
        <p className="text-[13px] font-bold">Sin actividad</p>
        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
          {deals.length}
        </Badge>
      </div>
      <div className="rounded-[10px] border border-border bg-card overflow-hidden divide-y divide-border/50">
        {deals.map((deal) => {
          // Extract days from issue text for badge
          const daysMatch = deal.issue.match(/(\d+)/);
          const days = deal.daysSinceLastView ?? (daysMatch ? parseInt(daysMatch[1]) : null);

          return (
            <Link
              key={deal.id}
              href={`/crm/deals/${deal.id}`}
              className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-accent/20"
              style={{ borderLeft: `3px solid ${deal.stageColor ?? 'hsl(var(--border))'}` }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate">{deal.companyName}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {deal.contactName}
                  <span style={{ color: deal.stageColor ?? undefined }}> · {deal.stageName}</span>
                </p>
              </div>
              <DaysBadge days={days} />
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
