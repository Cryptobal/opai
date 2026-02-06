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
import { useState } from 'react';

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
  const [showTooltip, setShowTooltip] = useState<string | null>(null);
  const cards = [
    {
      label: 'Total',
      value: stats.total,
      icon: FileText,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      filter: 'all',
      tooltip: 'Todas las presentaciones creadas',
    },
    {
      label: 'Enviadas',
      value: stats.sent,
      icon: Send,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      filter: 'sent',
      tooltip: 'Presentaciones enviadas por email',
    },
    {
      label: 'Vistas',
      value: stats.viewed,
      subtitle: `${stats.totalViews} totales`,
      icon: Eye,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      filter: 'viewed',
      tooltip: 'Clientes que hicieron click en "Ver Propuesta" y abrieron la presentación',
    },
    {
      label: 'Sin Leer',
      value: stats.pending,
      subtitle: `${stats.sent > 0 ? ((stats.pending / stats.sent) * 100).toFixed(0) : 0}% pend`,
      icon: Mail,
      color: 'from-yellow-500 to-yellow-600',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20',
      filter: 'pending',
      tooltip: 'Presentaciones enviadas que aún no han sido vistas',
    },
    {
      label: 'Conversión',
      value: `${conversionRate.toFixed(1)}%`,
      subtitle: 'Vista/Env',
      icon: TrendingUp,
      color: 'from-pink-500 to-pink-600',
      bgColor: 'bg-pink-500/10',
      borderColor: 'border-pink-500/20',
      filter: null,
      tooltip: 'Porcentaje de presentaciones enviadas que fueron vistas',
    },
  ];

  return (
    <div className="space-y-2">
      {/* Tooltip de ayuda */}
      <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
        <Info className="w-3 h-3 text-blue-400 flex-shrink-0" />
        <p className="text-[10px] text-blue-300">
          <strong>Vistas:</strong> Cliente hizo click en "Ver Propuesta" y abrió la presentación | <strong>Sin Leer:</strong> Enviadas pero no vistas aún
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2">
        {cards.map((card, index) => {
          const Icon = card.icon;
          const isActive = activeFilter === card.filter;
          const isClickable = card.filter !== null && onFilterClick;
          
          const CardWrapper = isClickable ? 'button' : 'div';
          
          return (
            <CardWrapper
              key={index}
              onClick={isClickable ? () => onFilterClick!(card.filter!) : undefined}
              onMouseEnter={() => setShowTooltip(card.label)}
              onMouseLeave={() => setShowTooltip(null)}
              className={`relative overflow-hidden rounded-lg border ${card.borderColor} ${card.bgColor} backdrop-blur-sm p-2 transition-all ${
                isClickable ? 'cursor-pointer hover:scale-105 hover:shadow-lg' : ''
              } ${isActive ? 'ring-2 ring-white/30 shadow-lg' : ''}`}
              title={card.tooltip}
            >
              {/* Icon - minimalista */}
              <div className={`inline-flex p-1 rounded-md bg-gradient-to-br ${card.color} mb-1`}>
                <Icon className="w-3 h-3 text-white" />
              </div>

              {/* Value - compacto */}
              <div className="text-base sm:text-lg font-bold text-white mb-0.5">
                {typeof card.value === 'number' ? card.value : card.value}
              </div>

              {/* Label - minimalista */}
              <div className="text-[9px] sm:text-[10px] text-white/70 font-medium leading-tight">
                {card.label}
              </div>

              {/* Subtitle - muy pequeño */}
              {card.subtitle && (
                <div className="text-[8px] text-white/50 hidden sm:block mt-0.5">
                  {card.subtitle}
                </div>
              )}
            </CardWrapper>
          );
        })}
      </div>
    </div>
  );
}
