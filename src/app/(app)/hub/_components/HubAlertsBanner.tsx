"use client";

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronRight, Info, X } from 'lucide-react';
import type { HubAlert } from '../_lib/hub-types';

interface HubAlertsBannerProps {
  alerts: HubAlert[];
}

// Liquid Glass v1 — banners tintados translúcidos (gradiente + blur-1).
const severityStyles = {
  critical:
    'border-[hsl(var(--ds-danger)/0.28)] bg-gradient-to-b from-[hsl(var(--ds-danger)/0.14)] to-[hsl(var(--ds-danger)/0.05)] backdrop-blur-[16px] backdrop-saturate-150 text-status-danger-fg',
  warning:
    'border-[hsl(var(--ds-warn)/0.28)] bg-gradient-to-b from-[hsl(var(--ds-warn)/0.14)] to-[hsl(var(--ds-warn)/0.05)] backdrop-blur-[16px] backdrop-saturate-150 text-status-warn-fg',
  info:
    'border-[hsl(var(--ds-info)/0.28)] bg-gradient-to-b from-[hsl(var(--ds-info)/0.14)] to-[hsl(var(--ds-info)/0.05)] backdrop-blur-[16px] backdrop-saturate-150 text-status-info-fg',
} as const;

const severityIconBg = {
  critical: 'bg-[hsl(var(--ds-danger)/0.16)]',
  warning: 'bg-[hsl(var(--ds-warn)/0.16)]',
  info: 'bg-[hsl(var(--ds-info)/0.16)]',
} as const;

const severityIcons = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const;

/** Máximo de señales visibles antes de "Ver todo" (inicio breve en móvil). */
const MAX_VISIBLE_ALERTS = 3;

export function HubAlertsBanner({ alerts }: HubAlertsBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  // getAlerts ya ordena por severidad/urgencia; aquí solo se limita.
  const active = alerts.filter((a) => !dismissed.has(a.id));
  if (active.length === 0) return null;

  const visible = showAll ? active : active.slice(0, MAX_VISIBLE_ALERTS);
  const hiddenCount = active.length - visible.length;

  const dismiss = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {visible.map((alert) => {
        const Icon = severityIcons[alert.severity];
        return (
          <div
            key={alert.id}
            className={cn(
              'group relative flex items-stretch rounded-lg border overflow-hidden',
              severityStyles[alert.severity],
            )}
          >
            <Link
              href={alert.href}
              className="flex flex-1 items-center gap-3 p-3 transition-colors hover:bg-white/[0.04]"
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  severityIconBg[alert.severity],
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="min-w-0 flex-1 text-sm font-medium">
                {alert.message}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
            <button
              type="button"
              onClick={(e) => dismiss(alert.id, e)}
              className="px-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Descartar alerta"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="min-h-11 w-full rounded-lg text-ds-body font-medium text-primary transition-colors hover:bg-muted/40"
        >
          Ver todo ({active.length})
        </button>
      )}
    </div>
  );
}
