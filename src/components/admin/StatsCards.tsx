'use client';

/**
 * Stats Cards
 * 
 * Tarjetas de estadísticas principales del dashboard
 * Mobile-first, responsive, grid adaptativo
 */

import { 
  FileText, 
  Send, 
  Eye, 
  Mail, 
  MousePointer,
  TrendingUp,
  BarChart3,
  Info
} from 'lucide-react';
import { Stat } from '@/components/opai-ds';

interface StatsCardsProps {
  stats: {
    total: number;
    sent: number;
    viewed: number;
    pending: number;
    opened: number;
    clicked: number;
    totalViews: number;
    totalOpens: number;
    totalClicks: number;
  };
  conversionRate: number;
  openRate: number;
  clickRate: number;
  activeFilter?: string;
  onFilterClick?: (filter: string) => void;
}

export function StatsCards({ 
  stats, 
  conversionRate, 
  openRate, 
  clickRate,
  activeFilter = 'all',
  onFilterClick
}: StatsCardsProps) {
  return (
    <div className="space-y-2">
      {/* Tooltip de ayuda */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20">
        <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <p className="text-xs sm:text-sm text-blue-300">
          <strong>Vistas:</strong> Cliente hizo click en "Ver Propuesta" y abrió la presentación | <strong>Sin Leer:</strong> Enviadas pero no vistas aún
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-2">
        <button onClick={() => onFilterClick?.('all')} className="text-left">
          <Stat
            label="Total"
            value={stats.total}
            icon={FileText}
            hint="Todas"
            variant="brand"
            className={activeFilter === 'all' ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-muted cursor-pointer'}
          />
        </button>
        <button onClick={() => onFilterClick?.('sent')} className="text-left">
          <Stat
            label="Enviadas"
            value={stats.sent}
            icon={Send}
            variant="brand"
            className={activeFilter === 'sent' ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-muted cursor-pointer'}
          />
        </button>
        <button onClick={() => onFilterClick?.('viewed')} className="text-left">
          <Stat
            label="Vistas"
            value={stats.viewed}
            hint={`${stats.totalViews} totales`}
            icon={Eye}
            variant="ok"
            className={activeFilter === 'viewed' ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-muted cursor-pointer'}
          />
        </button>
        <button onClick={() => onFilterClick?.('pending')} className="text-left">
          <Stat
            label="Sin Leer"
            value={stats.pending}
            hint={`${stats.sent > 0 ? ((stats.pending / stats.sent) * 100).toFixed(0) : 0}% pend`}
            icon={Mail}
            variant="warn"
            className={activeFilter === 'pending' ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-muted cursor-pointer'}
          />
        </button>
        <div className="text-left hidden sm:block">
          <Stat
            label="Conversión"
            value={`${conversionRate.toFixed(1)}%`}
            hint="Vista/Env"
            icon={TrendingUp}
            variant="brand"
          />
        </div>
      </div>
    </div>
  );
}
