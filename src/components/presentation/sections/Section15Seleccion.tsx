'use client';

/**
 * Section15Seleccion - Funnel CENTRADO visual + grid criterios
 */

import { Section15_Seleccion } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Users, Filter } from 'lucide-react';
import { YouTubeEmbed, extractYouTubeId } from '../shared/YouTubeEmbed';
import { motion } from 'framer-motion';

interface Section15SeleccionProps {
  data: Section15_Seleccion;
}

export function Section15Seleccion({ data }: Section15SeleccionProps) {
  const theme = useThemeClasses();
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
            De 100 postulantes, solo 12 son asignados
          </p>
        </div>
        
        {/* Funnel CENTRADO visual */}
        <div className="max-w-3xl mx-auto mb-16">
          <div className="space-y-3">
            {data.funnel.map((stage, index) => {
              const widthPercent = (stage.quantity / maxValue) * 100;
              const isLast = index === data.funnel.length - 1;
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-center"
                >
                  <div
                    className={cn(
                      'glass-card p-4 rounded-xl border-2 transition-all hover:scale-105',
                      isLast 
                        ? 'border-teal-400/50 bg-gradient-to-r from-teal-500/20 to-blue-500/20 shadow-xl shadow-teal-500/20' 
                        : 'border-white/10'
                    )}
                    style={{ width: `${Math.max(widthPercent, 40)}%` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'font-bold text-sm',
                        isLast ? 'text-white' : 'text-white/80'
                      )}>
                        {stage.stage}
                      </span>
                      <span className={cn(
                        'text-2xl font-black',
                        isLast ? 'text-teal-400' : 'text-white'
                      )}>
                        {stage.quantity}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
        
        {/* Criterios - GRID 2 COLUMNAS */}
        <div className="max-w-4xl mx-auto mb-12">
          <h3 className="text-2xl font-bold text-center mb-8 text-white">
            Criterios de evaluación
          </h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            {data.criteria_table.map((criterion, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="glass-card p-5 rounded-xl border border-white/10 hover:border-teal-400/30 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center text-sm font-black text-white flex-shrink-0 group-hover:scale-110 transition-transform">
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white mb-1">
                      {criterion.criterion}
                    </h4>
                    <p className="text-sm text-white/60">
                      {criterion.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
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
