"use client";

import type { ComponentType, MouseEventHandler, ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Tag, type TagProps } from "@/components/opai-ds";
import { tintFromId } from "@/lib/entity-tint";

/**
 * CrmEntityCard — anatomía única de tarjeta de lista CRM.
 *
 * ┌──────────────────────────────────────────────┐
 * │ [avatar tint]  Título              [chevron] │
 * │                Meta secundaria               │
 * │ [chip] [chip] [chip] (+N)                    │
 * ├──────────────────────── hairline ────────────┤
 * │ MÉTRICA    MÉTRICA    MÉTRICA                │
 * └──────────────────────────────────────────────┘
 *
 * Variantes por props: avatar circular (personas) o cuadrado (empresas /
 * instalaciones con icono). Máximo 3 chips visibles (+N de overflow).
 */

export interface EntityCardChip {
  label: ReactNode;
  variant?: TagProps["variant"];
  icon?: ComponentType<{ className?: string }>;
  dot?: boolean;
}

export interface EntityCardMetric {
  label: string;
  value: ReactNode;
  /** Clase extra para el valor (p. ej. text-status-danger-fg) */
  valueClassName?: string;
}

export interface CrmEntityCardProps {
  href: string;
  /** Id para identidad cromática (tint) del avatar */
  entityId?: string;
  title: string;
  /** Adorno inline junto al título (p. ej. indicador de notas no leídas) */
  titleAdornment?: ReactNode;
  /** Línea secundaria bajo el título */
  meta?: ReactNode;
  avatar?: {
    photoUrl?: string | null;
    initials?: string;
    icon?: ComponentType<{ className?: string }>;
    shape?: "circle" | "square";
  };
  /** Chips de estado/contexto — se muestran máx. 3 (+N) */
  chips?: EntityCardChip[];
  /** Métricas del footer, separadas por hairline superior */
  metrics?: EntityCardMetric[];
  /** Contenido extra bajo la fila de chips (p. ej. fechas, acciones inline) */
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}

const MAX_CHIPS = 3;

export function CrmEntityCard({
  href,
  entityId,
  title,
  titleAdornment,
  meta,
  avatar,
  chips = [],
  metrics = [],
  children,
  onClick,
  className,
}: CrmEntityCardProps) {
  const AvatarIcon = avatar?.icon;
  const tint = entityId ? tintFromId(entityId) : undefined;
  const shape = avatar?.shape ?? "circle";
  const visibleChips = chips.slice(0, MAX_CHIPS);
  const hiddenChips = chips.length - visibleChips.length;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-lg border transition-colors hover:border-primary/30 hover:bg-accent/30",
        className
      )}
    >
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        {/* Fila principal: avatar + título/meta + chevron */}
        <div className="flex items-start gap-2.5 min-w-0">
          {avatar && (
            avatar.photoUrl ? (
              <img
                src={avatar.photoUrl}
                alt=""
                className={cn(
                  "h-9 w-9 shrink-0 border border-ds-border-default bg-background object-contain",
                  shape === "square" ? "rounded-lg" : "rounded-full"
                )}
              />
            ) : AvatarIcon ? (
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center",
                  shape === "square" ? "rounded-lg" : "rounded-full",
                  tint ? cn("bg-ds-surface-2 text-ds-text-2") : "bg-primary/10 text-primary"
                )}
              >
                <AvatarIcon className="h-4 w-4" />
              </span>
            ) : (
              <Avatar
                variant={tint ? "tint" : "default"}
                tint={tint}
                shape={shape}
                size="md"
                initials={avatar.initials}
                name={title}
                className="h-9 w-9 shrink-0"
              />
            )
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{title}</p>
              {titleAdornment}
            </div>
            {meta ? <div className="mt-0.5 truncate text-[12px] text-ds-text-3">{meta}</div> : null}
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60" />
        </div>

        {/* Fila de chips (máx. 3 + overflow) */}
        {visibleChips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {visibleChips.map((chip, i) => (
              <Tag key={i} variant={chip.variant ?? "neutral"} size="sm" icon={chip.icon} dot={chip.dot}>
                {chip.label}
              </Tag>
            ))}
            {hiddenChips > 0 && (
              <Tag variant="neutral" size="sm">
                +{hiddenChips}
              </Tag>
            )}
          </div>
        )}

        {children}
      </div>

      {/* Footer de métricas — hairline superior */}
      {metrics.length > 0 && (
        <div
          className="grid border-t border-ds-border-subtle px-3.5 py-2.5 sm:px-4"
          style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}
        >
          {metrics.map((metric, i) => (
            <div key={i} className="min-w-0 text-center first:text-left last:text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{metric.label}</p>
              <p className={cn("truncate text-[13px] font-medium tabular-nums", metric.valueClassName)}>
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
