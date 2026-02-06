'use client';

/**
 * Conversion Chart
 * 
 * Gráfico visual de conversión de presentaciones
 * Mobile-first, responsive, colapsable
 */

import { useState } from 'react';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

interface ConversionChartProps {
  stats: {
    sent: number;
    viewed: number;
    pending: number;
    opened: number;
    clicked: number;
  };
  conversionRate: number;
  openRate: number;
  clickRate: number;
}

export function ConversionChart({ stats, conversionRate, openRate, clickRate }: ConversionChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Calcular porcentajes relativos al total de enviadas
  const viewedPercentage = stats.sent > 0 ? (stats.viewed / stats.sent) * 100 : 0;
  const pendingPercentage = stats.sent > 0 ? (stats.pending / stats.sent) * 100 : 0;

  const stages = [
    { 
      label: 'Enviadas', 
      value: stats.sent, 
      percentage: 100,
      color: 'bg-purple-500'
    },
    { 
      label: 'Vistas (Éxito)', 
      value: stats.viewed, 
      percentage: viewedPercentage,
      color: 'bg-green-500'
    },
    { 
      label: 'Sin Leer', 
      value: stats.pending, 
      percentage: pendingPercentage,
      color: 'bg-yellow-500'
    },
  ];

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4">
      {/* Header con botón collapse */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-gradient-to-br from-pink-500 to-purple-600">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              Embudo de Conversión
            </h2>
            <p className="text-xs text-white/60 hidden sm:block">
              Seguimiento del flujo
            </p>
          </div>
        </div>
        
        {/* Botón expandir/contraer */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white" />
          )}
        </button>
      </div>

      {/* Funnel - solo si está expandido */}
      {isExpanded && (
        <div className="space-y-2 mt-3">
          {stages.map((stage, index) => (
            <div key={index} className="space-y-1">
              {/* Label y valor */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/80 font-medium">{stage.label}</span>
                <span className="text-white font-bold">
                  {stage.value} ({stage.percentage.toFixed(1)}%)
                </span>
              </div>

              {/* Barra de progreso - más compacta */}
              <div className="relative h-6 bg-white/5 rounded-md overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${stage.color} transition-all duration-1000 ease-out flex items-center justify-center text-white text-xs font-semibold`}
                  style={{ width: `${stage.percentage}%` }}
                >
                  {stage.percentage > 15 && `${stage.percentage.toFixed(1)}%`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Insights - siempre visibles, más compactos */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="p-2 rounded-md bg-white/5 border border-white/10">
          <div className="text-[10px] text-white/60 mb-0.5">Tasa de Éxito</div>
          <div className="text-sm sm:text-base font-bold text-green-400">
            {conversionRate.toFixed(1)}%
          </div>
          <div className="text-[8px] text-white/40 mt-0.5">Enviadas → Vistas</div>
        </div>
        <div className="p-2 rounded-md bg-white/5 border border-white/10">
          <div className="text-[10px] text-white/60 mb-0.5">Pendientes</div>
          <div className="text-sm sm:text-base font-bold text-yellow-400">
            {stats.pending}
          </div>
          <div className="text-[8px] text-white/40 mt-0.5">Aún no vistas</div>
        </div>
      </div>
    </div>
  );
}
