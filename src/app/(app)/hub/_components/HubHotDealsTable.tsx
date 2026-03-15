'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Phone, MessageCircle, Mail, ExternalLink } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import { formatCLP, normalizeChileanPhone, whatsappUrl } from '../_lib/hub-utils';
import type { ClosingHotDeal } from '../_lib/hub-types';

interface Props {
  deals: ClosingHotDeal[];
}

function HeatIndicator({ score }: { score: number }) {
  const title = 'Interés: vistas de propuesta + recencia (últimos 7 días)';
  if (score >= 70) return <span title={title} className="text-red-400 font-semibold text-xs tabular-nums whitespace-nowrap cursor-help">🔥🔥🔥 {score}</span>;
  if (score >= 30) return <span title={title} className="text-orange-400 font-semibold text-xs tabular-nums whitespace-nowrap cursor-help">🔥🔥 {score}</span>;
  if (score > 0) return <span title={title} className="text-muted-foreground font-semibold text-xs tabular-nums whitespace-nowrap cursor-help">🔥 {score}</span>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span className="text-emerald-400 text-[10px]">↑</span>;
  if (trend === 'down') return <span className="text-red-400 text-[10px]">↓</span>;
  return <span className="text-muted-foreground text-[10px]">—</span>;
}

function ActionIcons({ deal }: { deal: ClosingHotDeal }) {
  const phone = deal.contactPhone ? normalizeChileanPhone(deal.contactPhone) : null;
  const handlePhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phone) window.location.href = `tel:+${phone}`;
  };
  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deal.contactPhone) window.open(whatsappUrl(deal.contactPhone), '_blank', 'noopener,noreferrer');
  };
  const handleEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deal.contactEmail) window.location.href = `mailto:${deal.contactEmail}`;
  };
  return (
    <span className="inline-flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity ml-1">
      {phone && (
        <button
          type="button"
          onClick={handlePhone}
          className="text-muted-foreground/50 hover:text-emerald-400 transition-colors p-0.5 -m-0.5 bg-transparent border-0 cursor-pointer"
          title="Llamar"
        >
          <Phone className="h-[14px] w-[14px]" />
        </button>
      )}
      {deal.contactPhone && (
        <button
          type="button"
          onClick={handleWhatsApp}
          className="text-muted-foreground/50 hover:text-green-400 transition-colors p-0.5 -m-0.5 bg-transparent border-0 cursor-pointer"
          title="WhatsApp"
        >
          <MessageCircle className="h-[14px] w-[14px]" />
        </button>
      )}
      {deal.contactEmail && (
        <button
          type="button"
          onClick={handleEmail}
          className="text-muted-foreground/50 hover:text-blue-400 transition-colors p-0.5 -m-0.5 bg-transparent border-0 cursor-pointer"
          title="Email"
        >
          <Mail className="h-[14px] w-[14px]" />
        </button>
      )}
      {deal.proposalLink && (
        <Link
          href={deal.proposalLink}
          target="_blank"
          className="text-muted-foreground/50 hover:text-primary transition-colors inline-flex"
          onClick={(e) => e.stopPropagation()}
          title="Ver propuesta"
        >
          <ExternalLink className="h-[14px] w-[14px]" />
        </Link>
      )}
    </span>
  );
}

export function HubHotDealsTable({ deals }: Props) {
  const router = useRouter();
  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      {/* Header */}
      <div
        className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground"
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 1.5fr 1fr 0.7fr minmax(70px, 0.6fr) 60px minmax(70px, 0.6fr)',
          padding: '6px 14px',
        }}
      >
        <span>#</span>
        <span>Empresa</span>
        <span>Contacto</span>
        <span>Etapa</span>
        <span className="text-center">Vistas</span>
        <span className="text-center">Score</span>
        <span className="text-right">Monto</span>
      </div>

      {/* Rows */}
      {deals.map((deal, idx) => {
        const rank = idx + 1;
        return (
          <div
            key={deal.id}
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/crm/deals/${deal.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(`/crm/deals/${deal.id}`);
              }
            }}
            className="group/row block transition-colors hover:bg-accent/20 cursor-pointer"
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1.5fr 1fr 0.7fr minmax(70px, 0.6fr) 60px minmax(70px, 0.6fr)',
              padding: '9px 14px',
              borderBottom: '1px solid hsl(var(--border) / 0.5)',
              borderLeft: `3px solid ${deal.stageColor ?? 'transparent'}`,
            }}
          >
            {/* Rank */}
            <span className={`text-xs tabular-nums font-medium ${rank <= 3 ? 'text-teal-400' : 'text-muted-foreground'}`}>
              {rank}
            </span>

            {/* Empresa */}
            <span className="text-[13px] font-medium truncate pr-2">
              {deal.companyName}
            </span>

            {/* Contacto + actions on hover */}
            <span className="flex items-center min-w-0 pr-2">
              <span className="text-[11px] truncate">{deal.contactName}</span>
              <ActionIcons deal={deal} />
            </span>

            {/* Etapa */}
            <span
              className="text-[10px] font-bold truncate"
              style={{ color: deal.stageColor ?? undefined }}
            >
              {deal.stageName}
            </span>

            {/* Vistas */}
            <span className="flex items-center justify-center gap-0.5 text-[11px] text-muted-foreground tabular-nums">
              {deal.totalViews > 0 ? (
                <>
                  <Eye className="h-3 w-3 text-muted-foreground/50" />
                  {deal.totalViews}
                  {deal.lastViewedAt && (
                    <span className="hidden xl:inline text-[10px]"> · {timeAgo(deal.lastViewedAt)}</span>
                  )}
                  {' '}<TrendIcon trend={deal.viewTrend} />
                </>
              ) : '—'}
            </span>

            {/* Score */}
            <span className="flex items-center justify-center">
              <HeatIndicator score={deal.heatScore} />
            </span>

            {/* Monto */}
            <span className="text-right text-[11px] font-bold tabular-nums text-teal-400 whitespace-nowrap">
              {deal.amount > 0 ? `${formatCLP(Math.round(deal.amount / 1000))}k/mes` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
