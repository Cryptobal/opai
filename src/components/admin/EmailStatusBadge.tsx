'use client';

/**
 * Email Status Badge
 * 
 * Muestra el estado actual del email de forma compacta
 * Estados: Delivered, Opened, Clicked, Bounced, Pending
 */

import { Mail, MailOpen, MousePointer, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { Presentation } from '@prisma/client';

interface EmailStatusBadgeProps {
  presentation: Presentation;
}

export function EmailStatusBadge({ presentation }: EmailStatusBadgeProps) {
  // Determinar el estado más relevante del email
  const getEmailStatus = () => {
    // Si rebotó, mostrar error
    if (presentation.status === 'expired') {
      return {
        label: 'Bounced',
        icon: AlertCircle,
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        tooltip: 'Email rebotado',
      };
    }

    // Si tiene clicks, es el estado más avanzado
    if (presentation.clickCount > 0) {
      return {
        label: 'Clicked',
        icon: MousePointer,
        color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        tooltip: `${presentation.clickCount} click${presentation.clickCount > 1 ? 's' : ''} en el email`,
      };
    }

    // Si fue abierto
    if (presentation.openCount > 0) {
      return {
        label: 'Abierto',
        icon: MailOpen,
        color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        tooltip: `Abierto ${presentation.openCount} vez${presentation.openCount > 1 ? 'es' : ''}`,
      };
    }

    // Si fue entregado pero no abierto
    if (presentation.deliveredAt) {
      return {
        label: 'Entregado',
        icon: CheckCircle,
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        tooltip: 'Email entregado',
      };
    }

    // Si fue enviado pero aún no hay confirmación
    if (presentation.emailSentAt) {
      return {
        label: 'Enviado',
        icon: Mail,
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        tooltip: 'Email enviado, esperando confirmación',
      };
    }

    // Draft o no enviado
    return {
      label: 'Borrador',
      icon: Clock,
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      tooltip: 'No enviado',
    };
  };

  const status = getEmailStatus();
  const Icon = status.icon;

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${status.color} transition-all min-w-[80px] justify-center`}
      title={status.tooltip}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="text-[10px] font-medium whitespace-nowrap">{status.label}</span>
    </div>
  );
}
