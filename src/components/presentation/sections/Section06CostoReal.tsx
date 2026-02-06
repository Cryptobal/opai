'use client';

/**
 * Section06CostoReal - El verdadero costo de la seguridad
 * Comparación de modelos tradicional vs GARD con costos en UF
 */

import { useState } from 'react';
import { Section06_CostoReal } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { AlertTriangle, Shield, Info, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HiddenCostsModal } from '../shared/HiddenCostsModal';

interface Section06CostoRealProps {
  data: Section06_CostoReal;
}

export function Section06CostoReal({ data }: Section06CostoRealProps) {
  const theme = useThemeClasses();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'traditional' | 'gard'>('traditional');
  
  const openModal = (type: 'traditional' | 'gard') => {
    setModalType(type);
    setModalOpen(true);
  };
  
  return (
    <SectionWrapper id="s06-costo-real" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            El verdadero costo de la seguridad
          </h2>
          
          <p className={cn('text-lg md:text-xl max-w-3xl mx-auto', theme.textMuted)}>
            La pregunta correcta no es "cuánto cuesta", sino "cuánto me cuesta NO tenerlo".
          </p>
        </div>
        
        {/* Comparison Cards */}
        <StaggerContainer className="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto mb-8">
          {/* Traditional Model */}
          <StaggerItem>
            <div className={cn(
              'p-8 rounded-xl border-2 border-red-500/50 h-full',
              'bg-gradient-to-br from-red-900/10 to-red-900/5'
            )}>
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="w-10 h-10 text-red-500" />
                <div>
                  <h3 className={cn('text-2xl font-bold', theme.text)}>
                    Costo Bajo + Alto Riesgo
                  </h3>
                  <p className="text-sm text-red-400">Modelo tradicional</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-baseline">
                  <span className={cn('text-base', theme.textMuted)}>Tarifa mensual</span>
                  <span className={cn('text-2xl font-bold', theme.text)}>85 UF</span>
                </div>
                
                <div className="flex justify-between items-baseline">
                  <span className={cn('text-base', theme.textMuted)}>Tarifa anual</span>
                  <span className={cn('text-xl font-semibold', theme.text)}>1.020 UF</span>
                </div>
                
                <div className="pt-4 border-t border-red-500/30">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-red-400">
                      Costos ocultos estimados
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openModal('traditional')}
                      className="h-6 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                    >
                      <Info className="w-4 h-4 mr-1" />
                      Ver desglose
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-red-500 rotate-180" />
                    <span className="text-2xl font-bold text-red-500">30 UF/mes</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-6 border-t-2 border-red-500/50">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-lg font-semibold">TOTAL REAL 12 meses</span>
                  <span className="text-3xl font-bold text-red-500">1.380 UF</span>
                </div>
                <p className="text-xs text-red-400/80 mt-3">
                  Incluye: incidentes, rotación, multas, tiempo gerencial, riesgo reputacional
                </p>
              </div>
            </div>
          </StaggerItem>
          
          {/* GARD Model */}
          <StaggerItem>
            <div className={cn(
              'p-8 rounded-xl border-2 border-green-500/50 h-full',
              'bg-gradient-to-br from-green-900/10 to-green-900/5',
              'relative overflow-hidden'
            )}>
              {/* Badge */}
              <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                Recomendado
              </div>
              
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-10 h-10 text-green-500" />
                <div>
                  <h3 className={cn('text-2xl font-bold', theme.text)}>
                    Costo Controlado + Bajo Riesgo
                  </h3>
                  <p className="text-sm text-green-400">Modelo GARD</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-baseline">
                  <span className={cn('text-base', theme.textMuted)}>Tarifa mensual</span>
                  <span className={cn('text-2xl font-bold', theme.text)}>105 UF</span>
                </div>
                
                <div className="flex justify-between items-baseline">
                  <span className={cn('text-base', theme.textMuted)}>Tarifa anual</span>
                  <span className={cn('text-xl font-semibold', theme.text)}>1.260 UF</span>
                </div>
                
                <div className="pt-4 border-t border-green-500/30">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-green-400">
                      Costos ocultos estimados
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openModal('gard')}
                      className="h-6 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/20"
                    >
                      <Info className="w-4 h-4 mr-1" />
                      Ver desglose
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-green-500" />
                    <span className="text-2xl font-bold text-green-500">1 UF/mes</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-6 border-t-2 border-green-500/50">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-lg font-semibold">TOTAL REAL 12 meses</span>
                  <span className="text-3xl font-bold text-green-500">1.272 UF</span>
                </div>
                <p className="text-xs text-green-400/80 mt-3">
                  ✓ Todo incluido: supervisión, reportes, cumplimiento, tecnología, contingencias
                </p>
              </div>
            </div>
          </StaggerItem>
        </StaggerContainer>
        
        {/* Disclaimer */}
        <div className={cn(
          'max-w-4xl mx-auto p-6 rounded-lg border',
          theme.border,
          'bg-blue-500/5 border-blue-500/30'
        )}>
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className={cn('font-semibold mb-1', theme.text)}>
                Nota sobre valores estimativos:
              </p>
              <p className={theme.textMuted}>
                Los costos presentados están calculados para un puesto de seguridad 4x4 (24/7) con un 
                costo base aproximado de <strong>105 UF mensuales</strong>. Estos valores son referenciales 
                y pueden variar según la instalación específica, ubicación geográfica, nivel de riesgo, 
                requisitos especiales y características particulares de cada servicio.
              </p>
            </div>
          </div>
        </div>
      </ContainerWrapper>
      
      {/* Hidden Costs Modal */}
      <HiddenCostsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        modelType={modalType}
        costs={modalType === 'traditional' ? [
          {
            icon: 'alert',
            title: 'Incidentes de seguridad',
            description: 'Robos, hurtos, daños a la propiedad que ocurren por falta de supervisión adecuada o guardias mal capacitados.',
            estimatedImpact: '10-15 UF/mes'
          },
          {
            icon: 'users',
            title: 'Rotación de personal',
            description: 'Costos de reclutamiento, capacitación y pérdida de productividad por alta rotación de guardias (promedio 40-60% anual).',
            estimatedImpact: '5-8 UF/mes'
          },
          {
            icon: 'warning',
            title: 'Multas y sanciones',
            description: 'Multas de la Dirección del Trabajo, SUSESO, o incumplimientos contractuales por parte del proveedor.',
            estimatedImpact: '3-5 UF/mes'
          },
          {
            icon: 'clock',
            title: 'Tiempo gerencial',
            description: 'Horas del equipo administrativo dedicadas a resolver problemas, gestionar reclamos y supervisar al proveedor.',
            estimatedImpact: '5-7 UF/mes'
          },
          {
            icon: 'trending',
            title: 'Riesgo reputacional',
            description: 'Impacto en imagen corporativa por incidentes de seguridad, conflictos laborales o problemas con clientes/visitantes.',
            estimatedImpact: '5-10 UF/mes'
          }
        ] : [
          {
            icon: 'shield',
            title: 'Prevención de incidentes',
            description: 'Sistema de supervisión 24/7, tecnología integrada y protocolos estandarizados que minimizan incidentes.',
            estimatedImpact: '< 0.5 UF/mes'
          },
          {
            icon: 'users',
            title: 'Estabilidad del personal',
            description: 'Baja rotación (< 15% anual) gracias a mejores condiciones laborales y desarrollo profesional.',
            estimatedImpact: '< 0.2 UF/mes'
          },
          {
            icon: 'alert',
            title: 'Cumplimiento normativo',
            description: 'Gestión proactiva de certificaciones, permisos y cumplimiento legal que evita multas y sanciones.',
            estimatedImpact: '< 0.1 UF/mes'
          },
          {
            icon: 'clock',
            title: 'Autonomía operativa',
            description: 'Reportabilidad automática y gestión profesional que reduce drásticamente el tiempo gerencial requerido.',
            estimatedImpact: '< 0.2 UF/mes'
          }
        ]}
        totalImpact={modalType === 'traditional' ? '~30 UF/mes' : '~1 UF/mes'}
      />
    </SectionWrapper>
  );
}
