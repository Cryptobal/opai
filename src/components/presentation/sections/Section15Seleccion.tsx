'use client';

/**
 * Section15Seleccion - Funnel con barras animadas horizontales
 */

import { Section15_Seleccion } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Users, Filter, Brain, Briefcase, RefreshCw, ClipboardCheck, Activity } from 'lucide-react';
import { YouTubeEmbed, extractYouTubeId } from '../shared/YouTubeEmbed';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

interface Section15SeleccionProps {
  data: Section15_Seleccion;
}

const criteriaIcons = [Brain, Briefcase, RefreshCw, ClipboardCheck, Activity];

// Colores para cada etapa del funnel
const funnelColors = [
  { bg: 'from-blue-500 to-blue-400', text: 'text-blue-400', ring: 'ring-blue-400' },
  { bg: 'from-purple-500 to-purple-400', text: 'text-purple-400', ring: 'ring-purple-400' },
  { bg: 'from-pink-500 to-pink-400', text: 'text-pink-400', ring: 'ring-pink-400' },
  { bg: 'from-orange-500 to-orange-400', text: 'text-orange-400', ring: 'ring-orange-400' },
  { bg: 'from-teal-500 to-teal-400', text: 'text-teal-400', ring: 'ring-teal-400' }, // Final destacado
];

export function Section15Seleccion({ data }: Section15SeleccionProps) {
  const theme = useThemeClasses();
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.3 });
  const maxValue = data.funnel[0]?.quantity || 100;
  
  return (
    <SectionWrapper id="s15-seleccion" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <Filter className="w-14 h-14 mx-auto mb-6 text-teal-400" />
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-white leading-tight">
            Selección rigurosa
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
            De <span className="font-black text-white">100 postulantes</span>, solo <span className="font-black text-teal-400">12 son asignados</span>
          </p>
        </div>
        
        {/* Funnel con BARRAS ANIMADAS */}
        <div ref={ref} className="max-w-4xl mx-auto mb-16">
          <div className="space-y-4">
            {data.funnel.map((stage, index) => {
              const widthPercent = (stage.quantity / maxValue) * 100;
              const isLast = index === data.funnel.length - 1;
              const colors = funnelColors[index % funnelColors.length];
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className="flex items-center gap-4"
                >
                  {/* Círculo con número - COLORES DIFERENTES */}
                  <div className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black text-white flex-shrink-0 shadow-xl ring-2',
                    `bg-gradient-to-br ${colors.bg}`,
                    colors.ring,
                    isLast && 'ring-4 animate-pulse'
                  )}>
                    {stage.quantity}
                  </div>
                  
                  {/* Barra animada */}
                  <div className="flex-1 relative">
                    {/* Background de la barra */}
                    <div className="h-14 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                      {/* Barra que crece */}
                      <motion.div
                        initial={{ width: 0 }}
                        animate={inView ? { width: `${widthPercent}%` } : { width: 0 }}
                        transition={{ duration: 1.5, delay: index * 0.2, ease: 'easeOut' }}
                        className={cn(
                          'h-full flex items-center px-4',
                          `bg-gradient-to-r ${colors.bg}`,
                          isLast && 'shadow-lg shadow-teal-500/50'
                        )}
                      >
                        <span className={cn(
                          'font-bold text-sm text-white',
                          isLast && 'text-base'
                        )}>
                          {stage.stage}
                        </span>
                      </motion.div>
                    </div>
                    
                    {/* Porcentaje a la derecha */}
                    <div className={cn(
                      'absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold',
                      colors.text
                    )}>
                      {Math.round(widthPercent)}%
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
        
        {/* Criterios - GRID 5 HORIZONTAL */}
        <div className="mb-12">
          <h3 className="text-2xl font-bold text-center mb-8 text-white">
            Criterios de evaluación
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-6xl mx-auto">
            {data.criteria_table.map((criterion, index) => {
              const Icon = criteriaIcons[index % criteriaIcons.length];
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="glass-card p-5 rounded-xl border border-white/10 hover:border-teal-400/30 transition-all text-center group"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-teal-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-2">
                    {criterion.criterion}
                  </h4>
                  <p className="text-xs text-white/60 leading-snug">
                    {criterion.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
        
        {/* Video */}
        <div className="mb-12 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-center mb-6 text-white">
            Proceso de verificación
          </h3>
          <YouTubeEmbed 
            videoId={extractYouTubeId('https://youtu.be/a6TSsPvaoZM')}
            title="Verificación de antecedentes"
          />
        </div>
        
        {/* Stat */}
        <div className="text-center">
          <div className="inline-block glass-card px-8 py-5 rounded-xl border border-teal-400/30">
            <Users className="w-10 h-10 mx-auto mb-3 text-teal-400" />
            <p className="text-sm font-semibold text-white/70 mb-2">
              Tasa de permanencia
            </p>
            <p className="text-4xl font-black text-white">
              {data.retention_rate}
            </p>
          </div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
