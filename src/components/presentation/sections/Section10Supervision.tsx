'use client';

/**
 * Section10Supervision - Rediseñado con timeline visual
 */

import { Section10_Supervision } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Eye, Clock, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section10SupervisionProps {
  data: Section10_Supervision;
}

export function Section10Supervision({ data }: Section10SupervisionProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s10-supervision" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <Eye className="w-14 h-14 mx-auto mb-6 text-teal-400" />
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-white leading-tight">
            Supervisión activa
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 max-w-3xl mx-auto">
            4 niveles de verificación permanente
          </p>
        </div>
        
        {/* Levels - Grid compacto */}
        <StaggerContainer className="grid md:grid-cols-4 gap-6 mb-16">
          {data.levels.map((level, index) => (
            <StaggerItem key={index}>
              <div className={cn(
                'glass-card p-6 rounded-xl text-center border transition-all hover:scale-105',
                level.level === 1 
                  ? 'border-teal-400/50 bg-teal-500/10' 
                  : 'border-white/10'
              )}>
                <div className={cn(
                  'text-4xl font-black mb-2',
                  level.level === 1 ? 'text-teal-400' : 'text-white'
                )}>
                  {level.level}
                </div>
                <h4 className="text-base font-bold text-white mb-2">
                  {level.name}
                </h4>
                <p className="text-sm text-white/60 mb-3">
                  {level.description}
                </p>
                <div className="text-xs font-semibold text-teal-400">
                  {level.frequency}
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
        
        {/* Timeline nocturno - VISUAL MEJORADO */}
        <div className="max-w-5xl mx-auto mb-16">
          <h3 className="text-2xl font-bold text-center mb-10 text-white">
            Ejemplo: Turno nocturno (20:00 - 08:00)
          </h3>
          
          {/* Timeline visual */}
          <div className="relative">
            {/* Línea de tiempo */}
            <div className="absolute left-0 right-0 top-8 h-1 bg-gradient-to-r from-teal-500/0 via-teal-500/50 to-teal-500/0" />
            
            <div className="grid grid-cols-5 gap-2">
              {data.night_shift_timeline.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15, type: 'spring' }}
                  className="relative text-center"
                >
                  {/* Punto en timeline */}
                  <div className="relative z-10 w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/30 mb-4">
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                  
                  {/* Hora */}
                  <div className="text-lg font-black text-teal-400 mb-2">
                    {item.time}
                  </div>
                  
                  {/* Actividad - ALTURA FIJA para simetría */}
                  <div className="glass-card p-3 rounded-lg border border-white/10 min-h-[60px] flex items-center justify-center">
                    <p className="text-xs text-white/80 leading-tight text-center">
                      {item.activity}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
        
        {/* SLA badges - GRID 2x2 */}
        <div className="max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-center mb-8 text-white">
            Compromisos de servicio (SLA)
          </h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            {data.sla.map((sla, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="glass-card p-6 rounded-xl border border-white/10 hover:border-teal-400/30 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500/20 to-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Shield className="w-6 h-6 text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-white/50 mb-1">SLA {index + 1}</div>
                    <div className="text-sm font-bold text-white">{sla}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
