'use client';

/**
 * Section27Implementacion - Grid 2x2 compacto
 */

import { Section27_Implementacion } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Calendar, CheckCircle2, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section27ImplementacionProps {
  data: Section27_Implementacion;
}

export function Section27Implementacion({ data }: Section27ImplementacionProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s27-implementacion">
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <Calendar className="w-14 h-14 mx-auto mb-6 text-teal-400" />
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-white leading-tight">
            Proceso de implementación
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 mb-4 max-w-2xl mx-auto">
            De la firma del contrato al servicio operativo
          </p>
          
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full glass-card border border-teal-400/30">
            <Clock className="w-4 h-4 text-teal-400" />
            <span className="font-bold text-white">{data.total_duration}</span>
          </div>
        </div>
        
        {/* Grid 2x2 - MEJOR PARA WEB */}
        <StaggerContainer className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {data.phases.map((phase, index) => (
            <StaggerItem key={index}>
              <motion.div
                whileHover={{ scale: 1.02, y: -5 }}
                className="relative glass-card rounded-2xl p-8 border border-white/10 hover:border-teal-400/30 transition-all h-full group"
              >
                {/* Badge semana */}
                <div className="absolute -top-3 -left-3 w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center text-xl font-black text-white shadow-lg shadow-teal-500/30 group-hover:scale-110 transition-transform">
                  {phase.week}
                </div>
                
                {/* Contenido */}
                <div className="pt-6">
                  <h3 className="text-xl font-black text-white mb-3">
                    {phase.title}
                  </h3>
                  
                  <p className="text-base text-white/70 mb-4 leading-relaxed">
                    {phase.description}
                  </p>
                  
                  {/* Entregables */}
                  <div className="pt-4 border-t border-white/10">
                    <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">
                      Entregables:
                    </h4>
                    <div className="space-y-2">
                      {phase.deliverables.map((deliverable, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-teal-400" />
                          <span className="text-sm text-white/80">{deliverable}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Requisitos del cliente */}
                  {phase.client_requirements && phase.client_requirements.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                        Necesitamos de ti:
                      </h4>
                      <ul className="space-y-1">
                        {phase.client_requirements.map((req, i) => (
                          <li key={i} className="text-xs text-white/60 flex items-start gap-2">
                            <span>•</span>
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>
        
        {/* Nota */}
        <div className="mt-12 text-center max-w-3xl mx-auto">
          <p className="text-base text-white/70">
            ¿Necesitas implementación más rápida? Podemos acelerar el proceso con coordinación intensiva.
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
