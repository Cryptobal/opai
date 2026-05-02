// DEPRECATED: replaced by HubHotDealsTable.tsx + HubHotDealsMobile.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Phone, MessageCircle, Mail, ExternalLink, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { timeAgo } from '@/lib/utils';
import { formatCLP, normalizeChileanPhone, whatsappUrl } from '../_lib/hub-utils';
import type { ClosingHotDeal } from '../_lib/hub-types';

interface Props {
  deal: ClosingHotDeal;
  rank: number;
}

function HeatIndicator({ score }: { score: number }) {
  if (score > 70) return <span className="text-status-danger-fg font-semibold text-sm whitespace-nowrap">🔥🔥🔥 {score}</span>;
  if (score >= 40) return <span className="text-status-warn-fg font-semibold text-sm whitespace-nowrap">🔥🔥 {score}</span>;
  if (score > 0) return <span className="text-muted-foreground font-semibold text-sm whitespace-nowrap">🔥 {score}</span>;
  return <span className="text-muted-foreground text-sm">—</span>;
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span className="text-status-ok-fg text-xs">▲</span>;
  if (trend === 'down') return <span className="text-status-danger-fg text-xs">▼</span>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

/** Mobile card layout — keeps expand/collapse for small screens */
export function HubHotDealRow({ deal, rank }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden transition-colors hover:bg-accent/20"
      style={{ borderLeftWidth: 3, borderLeftColor: deal.stageColor ?? 'var(--border)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-center gap-2"
      >
        <span className="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-base font-medium truncate">{deal.companyName}</p>
            <HeatIndicator score={deal.heatScore} />
          </div>
          <p className="text-sm text-muted-foreground truncate">{deal.dealTitle}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0"
              style={{ borderColor: `${deal.stageColor}40`, color: deal.stageColor ?? undefined }}
            >
              {deal.stageName}
            </Badge>
            {deal.totalViews > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                👁 {deal.totalViews}
                {deal.lastViewedAt && <> · {timeAgo(deal.lastViewedAt)}</>}
                {' '}<TrendIcon trend={deal.viewTrend} />
              </span>
            )}
            <span className="text-sm font-medium text-status-info-fg ml-auto">
              {deal.amount > 0 ? `${formatCLP(Math.round(deal.amount))}/mes` : '—'}
            </span>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform flex-none ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border/50 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Contacto: </span>
              <span className="font-medium">{deal.contactName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Guardias: </span>
              <span className="font-medium">{deal.totalPuestos}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Días en etapa: </span>
              <span className="font-medium">{deal.daysInCurrentStage}d</span>
            </div>
            {deal.proposalSentAt && (
              <div>
                <span className="text-muted-foreground">Propuesta: </span>
                <span className="font-medium">{timeAgo(deal.proposalSentAt)}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {deal.contactPhone && (
              <a
                href={`tel:+${normalizeChileanPhone(deal.contactPhone)}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-status-ok hover:text-white hover:border-status-ok-border"
              >
                <Phone className="h-3 w-3" /> Llamar
              </a>
            )}
            {deal.contactPhone && (
              <a
                href={whatsappUrl(deal.contactPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-status-ok hover:text-white hover:border-status-ok-border"
              >
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </a>
            )}
            {deal.contactEmail && (
              <a
                href={`mailto:${deal.contactEmail}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-status-info hover:text-white hover:border-status-info-border"
              >
                <Mail className="h-3 w-3" /> Email
              </a>
            )}
            <Link
              href={`/crm/deals/${deal.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
            >
              <ExternalLink className="h-3 w-3" /> Detalle
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** Desktop table row — flat, no expand. All info visible in one row. */
export function HubHotDealTableRow({ deal, rank }: Props) {
  return (
    <tr
      className="border-b border-border/50 hover:bg-accent/20 transition-colors"
      style={{ borderLeftWidth: 3, borderLeftColor: deal.stageColor ?? 'transparent' }}
    >
      <td className="px-2 py-2 w-8 text-center">
        <span className="inline-flex w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold items-center justify-center">
          {rank}
        </span>
      </td>
      <td className="px-2 py-2">
        <p className="text-sm font-medium truncate max-w-[200px]">{deal.companyName}</p>
        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{deal.dealTitle}</p>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm truncate max-w-[100px]">{deal.contactName}</span>
          {deal.contactPhone && (
            <a
              href={`tel:+${normalizeChileanPhone(deal.contactPhone)}`}
              className="text-muted-foreground/60 hover:text-status-ok-fg transition-colors shrink-0"
              title="Llamar"
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          {deal.contactPhone && (
            <a
              href={whatsappUrl(deal.contactPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/60 hover:text-status-ok-fg transition-colors shrink-0"
              title="WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          )}
          {deal.contactEmail && (
            <a
              href={`mailto:${deal.contactEmail}`}
              className="text-muted-foreground/60 hover:text-status-info-fg transition-colors shrink-0"
              title="Email"
            >
              <Mail className="h-3.5 w-3.5" />
            </a>
          )}
          <Link
            href={`/crm/deals/${deal.id}`}
            className="text-muted-foreground/60 hover:text-primary transition-colors shrink-0"
            title="Ver detalle"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </td>
      <td className="px-2 py-2">
        <Badge
          variant="outline"
          className="text-xs px-1.5 py-0"
          style={{ borderColor: `${deal.stageColor}40`, color: deal.stageColor ?? undefined }}
        >
          {deal.stageName}
        </Badge>
      </td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        {deal.totalViews > 0 ? (
          <span className="text-sm text-muted-foreground inline-flex items-center gap-0.5">
            👁 {deal.totalViews}
            {deal.lastViewedAt && <span className="hidden xl:inline"> · {timeAgo(deal.lastViewedAt)}</span>}
            {' '}<TrendIcon trend={deal.viewTrend} />
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-center">
        <HeatIndicator score={deal.heatScore} />
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <span className="text-sm font-medium text-status-info-fg">
          {deal.amount > 0 ? `${formatCLP(Math.round(deal.amount))}/mes` : '—'}
        </span>
      </td>
    </tr>
  );
}
