"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  FileText,
  ExternalLink,
  Clock3,
  MessageSquare,
  Shield,
} from "lucide-react";
import { Tag, StatusDot, Avatar } from "@/components/opai-ds";
import { cn, formatCLP, formatUFSuffix } from "@/lib/utils";
import { ageBucket, daysInStage, sanitizeStageColor } from "@/lib/crm/deal-metrics";
import type { CrmDeal } from "@/types";
import {
  getDealCommercialIndicators,
  getDealFollowUpIndicator,
} from "./deals-helpers";
import type { DealsDensity } from "./types";

type Props = {
  deal: CrmDeal;
  density?: DealsDensity;
  isOverlay?: boolean;
  onOpen?: () => void;
  hasUnreadNotes?: boolean;
};

export function DealCard({
  deal,
  density = "normal",
  isOverlay = false,
  onOpen,
  hasUnreadNotes = false,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `deal-${deal.id}` });

  const indicators = getDealCommercialIndicators(deal);
  const followUp = getDealFollowUpIndicator(deal);
  const { days, source } = daysInStage(deal);
  const bucket = ageBucket(days);
  const stageColor =
    sanitizeStageColor(deal.stage?.color) ?? "hsl(var(--ds-text-4))";
  const compact = density === "compact";
  const quotesCount = (deal.quotes || []).length;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderLeftColor: stageColor,
      }}
      className={cn(
        "rounded-md border border-ds-border-subtle border-l-[3px] bg-ds-surface-1 p-2 min-w-0 overflow-hidden transition-shadow hover:shadow-sm",
        isDragging && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div
          className="min-w-0 flex-1 cursor-pointer md:cursor-auto"
          onClick={() => !isOverlay && onOpen?.()}
        >
          <span className="flex items-center gap-1">
            <Link
              href={`/crm/deals/${deal.id}`}
              className="line-clamp-1 text-[13px] font-medium text-ds-text-1 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {deal.title}
            </Link>
            {hasUnreadNotes ? (
              <span className="relative shrink-0" title="Notas no leídas">
                <MessageSquare className="h-3 w-3 text-ds-text-3" />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-status-danger" />
              </span>
            ) : null}
          </span>

          {!compact ? (
            <p className="mt-0.5 truncate text-[12px] text-ds-text-3" title={deal.account?.name}>
              {deal.account?.name}
            </p>
          ) : null}

          <div className="mt-1">
            {indicators.amountClp > 0 ? (
              <>
                <p className="ds-num text-[13px] font-semibold text-ds-text-1">
                  {formatCLP(indicators.amountClp)}
                </p>
                <p className="ds-num text-[12px] text-ds-text-3">
                  {formatUFSuffix(indicators.amountUf)}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-status-warn-fg">Sin cotización activa</p>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {indicators.totalGuards > 0 ? (
              <Tag variant="neutral" size="sm" icon={Shield}>
                {indicators.totalGuards}
              </Tag>
            ) : null}
            {deal.isLicitacion ? (
              <Tag variant="info" size="sm">Licitación</Tag>
            ) : null}
            <span
              className="inline-flex items-center gap-1 text-[12px] text-ds-text-2"
              title={
                source === "created_at"
                  ? "Días desde creación (sin historial de etapa)"
                  : "Días en etapa actual"
              }
            >
              <StatusDot kind={bucket} size="sm" />
              {bucket === "ok" ? `${days} d` : `${days} d en etapa`}
            </span>
            {!compact && quotesCount > 0 ? (
              <FileText className="h-3.5 w-3.5 text-ds-text-3" aria-label={`${quotesCount} cotizaciones`} />
            ) : null}
            {!compact && deal.proposalLink ? (
              <a
                href={deal.proposalLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-ds-text-2"
                title="Ver propuesta"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
            {!compact && followUp ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[12px]",
                  followUp.overdue ? "text-status-danger-fg" : "text-status-warn-fg",
                )}
                title={`${followUp.label} · ${followUp.dateLabel}`}
              >
                <Clock3 className="h-3 w-3" />
              </span>
            ) : null}
          </div>

          {!compact ? (
            <div className="mt-2 flex items-center justify-between border-t border-dashed border-ds-border-subtle pt-1.5">
              <span className="truncate text-[12px] text-ds-text-4">Próxima acción</span>
              <Avatar name={deal.account?.name ?? "?"} size="sm" />
            </div>
          ) : null}
        </div>

        {!isOverlay ? (
          <button
            ref={setActivatorNodeRef}
            className="deals-touch mt-0.5 hidden rounded-md p-1 text-ds-text-3 hover:text-ds-text-1 md:block"
            {...attributes}
            {...listeners}
            aria-label="Arrastrar negocio"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
