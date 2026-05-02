'use client';

/**
 * Email Status Badge — Refactored
 *
 * Compact mode: inline pill (~20px) for table rows and mobile cards
 * Full mode: standard badge (~28px) for detail views
 *
 * Colores diferenciados:
 * - Borrador: Gris
 * - Enviado/Entregado: Verde
 * - Abierto: Azul
 * - Clicked: Púrpura
 * - Bounced: Rojo
 */

import { Mail, MailOpen, MousePointer, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { Presentation } from '@prisma/client';

interface EmailStatusBadgeProps {
  presentation: Presentation;
  compact?: boolean;
}

export function EmailStatusBadge({ presentation, compact = false }: EmailStatusBadgeProps) {
  const getEmailStatus = () => {
    if (presentation.status === 'expired') {
      return {
        label: 'Bounced',
        icon: AlertCircle,
        color: compact
          ? 'text-status-danger-fg'
          : 'bg-status-danger-soft text-status-danger-fg border-status-danger-border',
      };
    }

    if (presentation.clickCount > 0) {
      return {
        label: 'Clicked',
        icon: MousePointer,
        color: compact
          ? 'text-tint-violet-fg'
          : 'bg-tint-violet text-tint-violet-fg border-tint-violet-fg/20',
      };
    }

    if (presentation.openCount > 0) {
      return {
        label: 'Abierto',
        icon: MailOpen,
        color: compact
          ? 'text-status-info-fg'
          : 'bg-status-info-soft text-status-info-fg border-status-info-border',
      };
    }

    if (presentation.deliveredAt) {
      return {
        label: 'Entregado',
        icon: CheckCircle,
        color: compact
          ? 'text-status-ok-fg'
          : 'bg-status-ok-soft text-status-ok-fg border-status-ok-border',
      };
    }

    if (presentation.emailSentAt) {
      return {
        label: 'Enviado',
        icon: Mail,
        color: compact
          ? 'text-status-ok-fg/70'
          : 'bg-status-ok-soft text-status-ok-fg/70 border-status-ok-border/50',
      };
    }

    return {
      label: 'Borrador',
      icon: Clock,
      color: compact
        ? 'text-muted-foreground'
        : 'bg-muted text-muted-foreground border-border',
    };
  };

  const status = getEmailStatus();
  const Icon = status.icon;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold whitespace-nowrap ${status.color}`}>
        <Icon className="w-3 h-3" />
        {status.label}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border ${status.color} px-2.5 text-[11px] font-semibold transition-all`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="whitespace-nowrap">{status.label}</span>
    </div>
  );
}
