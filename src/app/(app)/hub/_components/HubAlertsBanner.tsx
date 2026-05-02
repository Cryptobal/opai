"use client";

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronRight, Info, X } from 'lucide-react';
import type { HubAlert } from '../_lib/hub-types';

interface HubAlertsBannerProps {
  alerts: HubAlert[];
}

const severityStyles = {
  critical: 'border-status-danger-border bg-status-danger-soft text-status-danger-fg',
  warning: 'border-status-warn-border bg-status-warn-soft text-status-warn-fg',
  info: 'border-status-info-border bg-status-info-soft text-status-info-fg',
} as const;

const severityIconBg = {
  critical: 'bg-status-danger-soft',
  warning: 'bg-status-warn-soft',
  info: 'bg-status-info-soft',
} as const;

const severityIcons = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const;

export function HubAlertsBanner({ alerts }: HubAlertsBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

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
    </div>
  );
}
