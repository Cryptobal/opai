import Link from 'next/link';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronRight, Info } from 'lucide-react';
import type { HubAlertasCriticasProps } from '../_lib/hub-types';

const severityStyles = {
  critical: 'border-red-500/30 bg-red-500/5 text-red-400',
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  info: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
} as const;

const severityIconBg = {
  critical: 'bg-red-500/15',
  warning: 'bg-amber-500/15',
  info: 'bg-blue-500/15',
} as const;

const severityIcons = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const;

export function HubAlertasCriticas({ alerts }: HubAlertasCriticasProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const Icon = severityIcons[alert.severity];
        return (
          <Link
            key={alert.id}
            href={alert.href}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/30',
              severityStyles[alert.severity],
            )}
          >
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", severityIconBg[alert.severity])}>
              <Icon className="h-4 w-4 shrink-0" />
            </div>
            <span className="min-w-0 flex-1 text-sm font-medium">{alert.message}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        );
      })}
    </div>
  );
}
