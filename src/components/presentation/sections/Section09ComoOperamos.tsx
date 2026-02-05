'use client';

/**
 * Section09ComoOperamos - Timeline HORIZONTAL compacto
 * Más moderno y visual
 */

import { Section09_ComoOperamos } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section09ComoOperamosProps {
  data: Section09_ComoOperamos;
}

export function Section09ComoOperamos({ data }: Section09ComoOperamosProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s09-como-operamos" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="inline-block px-5 py-2 rounded-full glass-card border border-teal-400/30 glow-teal mb-6"
          >
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Nuestro Proceso
            </span>
          </motion.div>
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-white leading-tight">
            Cómo operamos
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 max-w-3xl mx-auto">
            Proceso estructurado en 7 etapas con entregables claros
          </p>
        </div>
        
        {/* Timeline horizontal (desktop) */}
        <div className="hidden lg:block mb-12">
          <div className="relative">
            {/* Línea conectora */}
            <div className="absolute top-8 left-0 right-0 h-1 bg-gradient-to-r from-teal-500/30 via-teal-400/50 to-teal-500/30" />
            
            <div className="grid grid-cols-7 gap-2">
              {data.stages.map((stage, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="relative"
                >
                  {/* Número */}
                  <div className="relative z-10 w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-teal-500/30">
                    {stage.step}
                  </div>
                  
                  {/* Card */}
                  <div className="glass-card p-4 rounded-xl border border-white/10 hover:border-teal-400/30 transition-all group cursor-pointer">
                    <h4 className="text-sm font-bold text-white mb-2 text-center">
                      {stage.title}
                    </h4>
                    <p className="text-xs text-white/60 text-center leading-snug">
                      {stage.description}
                    </p>
                  </div>
                  
                  {/* Chevron */}
                  {index < data.stages.length - 1 && (
                    <ChevronRight className="absolute top-6 -right-4 w-6 h-6 text-teal-400/50 z-20" />
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Grid compacto (mobile/tablet) */}
        <StaggerContainer className="lg:hidden grid md:grid-cols-2 gap-4">
          {data.stages.map((stage, index) => (
            <StaggerItem key={index}>
              <div className="glass-card p-5 rounded-xl border border-white/10 hover:border-teal-400/30 transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center text-lg font-black text-white flex-shrink-0">
                    {stage.step}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white mb-1">
                      {stage.title}
                    </h4>
                    <p className="text-sm text-white/60">
                      {stage.description}
                    </p>
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
        
        {/* Nota */}
        <div className="mt-10 text-center max-w-3xl mx-auto">
          <p className="text-sm text-white/60">
            <span className="font-bold text-white">Nota:</span> Etapas 4-7 se ejecutan continuamente durante todo el servicio.
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
