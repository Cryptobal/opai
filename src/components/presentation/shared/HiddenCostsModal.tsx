'use client';

/**
 * HiddenCostsModal - Modal para desglosar costos ocultos
 * Muestra el detalle de cada componente de costos ocultos
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AlertCircle, TrendingUp, Shield, Clock, Users, AlertTriangle } from 'lucide-react';

interface HiddenCost {
  icon: 'alert' | 'trending' | 'shield' | 'clock' | 'users' | 'warning';
  title: string;
  description: string;
  estimatedImpact: string;
}

interface HiddenCostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelType: 'traditional' | 'gard';
  costs: HiddenCost[];
  totalImpact: string;
}

const iconMap = {
  alert: AlertCircle,
  trending: TrendingUp,
  shield: Shield,
  clock: Clock,
  users: Users,
  warning: AlertTriangle,
};

export function HiddenCostsModal({ 
  isOpen, 
  onClose, 
  modelType, 
  costs,
  totalImpact 
}: HiddenCostsModalProps) {
  const isTraditional = modelType === 'traditional';
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] lg:max-w-6xl max-h-[90vh] bg-slate-900 border-2 border-slate-700 overflow-hidden flex flex-col">
        <DialogHeader className="pb-3 border-b border-slate-700 flex-shrink-0">
          <DialogTitle className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            {isTraditional ? (
              <>
                <div className="p-1.5 rounded-lg bg-red-500/20 border border-red-500/50">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <span>Desglose de Costos Ocultos - Modelo Tradicional</span>
              </>
            ) : (
              <>
                <div className="p-1.5 rounded-lg bg-green-500/20 border border-green-500/50">
                  <Shield className="w-5 h-5 text-green-500" />
                </div>
                <span>Desglose de Costos Ocultos - Modelo GARD</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm mt-2 text-slate-300">
            {isTraditional ? (
              <>
                Gastos no evidentes por deficiencias en el servicio: incidentes, rotación, multas y tiempo gerencial.
              </>
            ) : (
              <>
                Costos minimizados gracias a supervisión profesional, tecnología integrada y procesos estandarizados.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto lg:overflow-visible py-4">
          {/* Grid de 2 columnas en desktop, 1 en mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
            {costs.map((cost, index) => {
              const Icon = iconMap[cost.icon];
              return (
                <div 
                  key={index}
                  className={cn(
                    'p-3 rounded-lg border-2 transition-all',
                    isTraditional 
                      ? 'border-red-500/50 bg-red-950/40 hover:bg-red-950/60' 
                      : 'border-green-500/50 bg-green-950/40 hover:bg-green-950/60'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'p-2 rounded-lg flex-shrink-0',
                      isTraditional 
                        ? 'bg-red-500/20 border border-red-500/40' 
                        : 'bg-green-500/20 border border-green-500/40'
                    )}>
                      <Icon className={cn(
                        'w-5 h-5',
                        isTraditional ? 'text-red-400' : 'text-green-400'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-base mb-1 text-white">{cost.title}</h4>
                      <p className="text-xs text-slate-300 mb-2 leading-snug">
                        {cost.description}
                      </p>
                      <div className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold border',
                        isTraditional 
                          ? 'bg-red-500/30 text-red-300 border-red-500/60' 
                          : 'bg-green-500/30 text-green-300 border-green-500/60'
                      )}>
                        <TrendingUp className="w-3 h-3" />
                        {cost.estimatedImpact}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total y disclaimer */}
          <div className={cn(
            'p-4 rounded-lg border-2',
            isTraditional 
              ? 'border-red-500 bg-red-950/60' 
              : 'border-green-500 bg-green-950/60'
          )}>
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-current/30">
              <span className="text-base font-bold text-white">Total Estimado:</span>
              <span className={cn(
                'text-2xl font-bold',
                isTraditional ? 'text-red-400' : 'text-green-400'
              )}>
                {totalImpact}
              </span>
            </div>
            
            <div className="text-xs text-slate-300 bg-slate-800/50 p-3 rounded border border-slate-700">
              <p className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
                <span className="leading-relaxed">
                  <strong className="text-white">Nota:</strong> Valores estimados basados en experiencia de GARD Security. 
                  Costos reales varían según instalación, ubicación, riesgo y características del servicio. 
                  Puesto 4x4 (24/7): ~105 UF mensuales.
                </span>
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
