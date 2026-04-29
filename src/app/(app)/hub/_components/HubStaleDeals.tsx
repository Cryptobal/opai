import Link from 'next/link';
import { AlertTriangle, ChevronRight, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { whatsappUrlWithMessage, HUB_WHATSAPP_MESSAGES, formatCLP } from '../_lib/hub-utils';
import type { ClosingStaleDeal } from '../_lib/hub-types';

interface Props {
  deals: ClosingStaleDeal[];
  sellerFirstName: string;
  tenantName: string;
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  const color = days > 30 ? 'text-red-400 border-red-500/30' : 'text-amber-400 border-amber-500/30';
  return (
    <span className={`text-xs font-bold tabular-nums border rounded px-1.5 py-0.5 ${color}`}>
      {days}d
    </span>
  );
}

export function HubStaleDeals({ deals, sellerFirstName, tenantName }: Props) {
  if (deals.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground/50" />
          <p className="text-sm font-bold">Sin actividad</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Todos los negocios tienen actividad reciente.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
        <p className="text-sm font-bold">Sin actividad</p>
        <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
          {deals.length}
        </Badge>
      </div>
      <div className="rounded-[10px] border border-border bg-card overflow-hidden divide-y divide-border/50">
        {deals.map((deal) => {
          // Extract days from issue text for badge
          const daysMatch = deal.issue.match(/(\d+)/);
          const days = deal.daysSinceLastView ?? (daysMatch ? parseInt(daysMatch[1]) : null);
          const waMessage = HUB_WHATSAPP_MESSAGES.stale(
            deal.contactName,
            deal.companyName,
            sellerFirstName,
            tenantName,
          );

          return (
            <div
              key={deal.id}
              className="flex flex-col md:flex-row md:items-center gap-2 px-3 py-2.5 transition-colors hover:bg-accent/20"
              style={{ borderLeft: `3px solid ${deal.stageColor ?? 'hsl(var(--border))'}` }}
            >
              <Link
                href={`/crm/deals/${deal.id}`}
                className="min-w-0 flex-1 flex items-start md:items-center gap-2 no-underline"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold truncate">{deal.companyName}</p>
                    {deal.amount > 0 && (
                      <span className="text-xs font-bold tabular-nums text-emerald-400 whitespace-nowrap">
                        {formatCLP(Math.round(deal.amount))}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {deal.contactName}
                    <span style={{ color: deal.stageColor ?? undefined }}> · {deal.stageName}</span>
                  </p>
                  <p className="text-[11px] text-amber-400/90 mt-0.5">
                    {deal.issue}
                  </p>
                </div>
                <DaysBadge days={days} />
                <ChevronRight className="hidden md:block h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </Link>
              {deal.contactPhone && (
                <a
                  href={whatsappUrlWithMessage(deal.contactPhone, waMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-green-500/40 bg-green-500/10 px-2.5 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500 hover:text-white transition-colors shrink-0 w-full md:w-auto"
                  title={`Enviar WhatsApp a ${deal.contactPhone}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
