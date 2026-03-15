'use client';

import { useRouter } from 'next/navigation';
import { Phone, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { timeAgo } from '@/lib/utils';
import { formatCLP, normalizeChileanPhone, whatsappUrl } from '../_lib/hub-utils';
import type { ClosingHotDeal } from '../_lib/hub-types';

interface Props {
  deals: ClosingHotDeal[];
}

function HeatIndicator({ score }: { score: number }) {
  const title = 'Interés: vistas de propuesta + recencia (últimos 7 días)';
  if (score >= 70) return <span title={title} className="text-red-400 font-semibold text-xs whitespace-nowrap">🔥🔥🔥 {score}</span>;
  if (score >= 30) return <span title={title} className="text-orange-400 font-semibold text-xs whitespace-nowrap">🔥🔥 {score}</span>;
  if (score > 0) return <span title={title} className="text-muted-foreground font-semibold text-xs whitespace-nowrap">🔥 {score}</span>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span className="text-emerald-400 text-[10px]">↑</span>;
  if (trend === 'down') return <span className="text-red-400 text-[10px]">↓</span>;
  return <span className="text-muted-foreground text-[10px]">—</span>;
}

export function HubHotDealsMobile({ deals }: Props) {
  const router = useRouter();
  return (
    <div className="space-y-2">
      {deals.map((deal, idx) => {
        const rank = idx + 1;
        return (
          <div
            key={deal.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/crm/deals/${deal.id}`)}
            onKeyDown={(e) => e.key === 'Enter' && router.push(`/crm/deals/${deal.id}`)}
            className="block rounded-lg border border-border bg-card overflow-hidden transition-colors hover:bg-accent/20 cursor-pointer"
            style={{ borderLeftWidth: 3, borderLeftColor: deal.stageColor ?? 'var(--border)' }}
          >
            <div className="p-3">
              {/* Line 1: rank + empresa + score */}
              <div className="flex items-center gap-2">
                <span className={`flex-none w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${rank <= 3 ? 'bg-teal-500/10 text-teal-400' : 'bg-primary/10 text-muted-foreground'}`}>
                  {rank}
                </span>
                <span className="text-sm font-medium truncate flex-1">{deal.companyName}</span>
                <HeatIndicator score={deal.heatScore} />
              </div>

              {/* Line 2: etapa + vistas + monto */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                  style={{ borderColor: `${deal.stageColor}40`, color: deal.stageColor ?? undefined }}
                >
                  {deal.stageName}
                </Badge>
                {deal.totalViews > 0 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    👁 {deal.totalViews}
                    {deal.lastViewedAt && <> · {timeAgo(deal.lastViewedAt)}</>}
                    {' '}<TrendIcon trend={deal.viewTrend} />
                  </span>
                )}
                <span className="text-[11px] font-medium text-teal-400 ml-auto tabular-nums">
                  {deal.amount > 0 ? `${formatCLP(Math.round(deal.amount))}/mes` : '—'}
                </span>
              </div>

              {/* Actions — visible directly on mobile */}
              <div className="flex items-center gap-2 mt-2">
                {deal.contactPhone && (
                  <a
                    href={`tel:+${normalizeChileanPhone(deal.contactPhone)}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-emerald-500 hover:text-white"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="h-3 w-3" /> Llamar
                  </a>
                )}
                {deal.contactPhone && (
                  <a
                    href={whatsappUrl(deal.contactPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-green-500 hover:text-white"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MessageCircle className="h-3 w-3" /> WA
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
