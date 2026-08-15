"use client";

/**
 * WorkbenchEntityCard — card de entidad unificada para listas comerciales
 * (icon tile + título/código + pill estado + chips + hairline + 3 métricas).
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface WorkbenchMetric {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}

export function WorkbenchEntityCard({
  href,
  icon,
  title,
  subtitle,
  statusSlot,
  chips,
  metrics,
  /** Slot inferior opcional (acciones inline) — separado por hairline, dentro del área clickeable. */
  footer,
  className,
}: {
  href: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  statusSlot?: ReactNode;
  chips?: ReactNode;
  metrics?: WorkbenchMetric[];
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-[18px] border border-[var(--glass-border)] p-[14px_15px_13px] transition",
        "bg-[var(--glass-fill)] shadow-[var(--glass-specular),0_8px_28px_rgba(0,0,0,0.28)]",
        "hover:-translate-y-0.5 hover:border-[rgba(var(--ds-glow-rgb),0.30)]",
        "hover:shadow-[var(--glass-specular),0_14px_38px_rgba(0,0,0,0.38),0_0_0_1px_rgba(var(--ds-glow-rgb),0.14)]",
        "active:scale-[0.985]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[13px] text-[var(--ds-glow)]",
            "bg-[linear-gradient(180deg,rgba(var(--ds-glow-rgb),0.16),rgba(20,168,138,0.06))]",
            "shadow-[inset_0_0_0_1px_rgba(var(--ds-glow-rgb),0.22),0_4px_14px_rgba(20,168,138,0.16)]",
          )}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[14px] font-semibold tracking-tight text-ds-text-1">
            {title}
          </b>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-[12px] text-ds-text-3">
              {subtitle}
            </span>
          ) : null}
        </div>
        {statusSlot}
      </div>
      {chips ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">{chips}</div>
      ) : null}
      {metrics && metrics.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-2.5 text-center">
          {metrics.slice(0, 3).map((m, i) => (
            <div key={i} className="min-w-0">
              <i className="block text-[12px] font-bold not-italic uppercase tracking-[0.1em] text-ds-text-3">
                {m.label}
              </i>
              <b
                className={cn(
                  "mt-0.5 block truncate font-mono text-[13px] font-bold",
                  m.highlight ? "text-[var(--ds-glow)]" : "text-ds-text-1",
                )}
              >
                {m.value}
              </b>
            </div>
          ))}
        </div>
      ) : null}
      {footer ? (
        <div className="mt-2.5 border-t border-white/[0.08] pt-2.5">{footer}</div>
      ) : null}
    </Link>
  );
}
