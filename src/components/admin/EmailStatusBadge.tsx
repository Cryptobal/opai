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
          ? 'text-red-400'
          : 'bg-red-500/15 text-red-400 border-red-500/20',
      };
    }

    if (presentation.clickCount > 0) {
      return {
        label: 'Clicked',
        icon: MousePointer,
        color: compact
          ? 'text-purple-400'
          : 'bg-purple-500/15 text-purple-400 border-purple-500/20',
      };
    }

    if (presentation.openCount > 0) {
      return {
        label: 'Abierto',
        icon: MailOpen,
        color: compact
          ? 'text-blue-400'
          : 'bg-blue-500/15 text-blue-400 border-blue-500/20',
      };
    }

    if (presentation.deliveredAt) {
      return {
        label: 'Entregado',
        icon: CheckCircle,
        color: compact
          ? 'text-emerald-400'
          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      };
    }

    if (presentation.emailSentAt) {
      return {
        label: 'Enviado',
        icon: Mail,
        color: compact
          ? 'text-emerald-400/70'
          : 'bg-emerald-500/10 text-emerald-400/70 border-emerald-500/15',
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
