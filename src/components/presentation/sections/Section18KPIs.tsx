'use client';

/**
 * Section18KPIs - Grid 3x2 ordenado tipo dashboard
 */

import { Section18_KPIs } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { BarChart3, Target } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section18KPIsProps {
  data: Section18_KPIs;
}

export function Section18KPIs({ data }: Section18KPIsProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s18-kpis" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <BarChart3 className="w-14 h-14 mx-auto mb-6 text-teal-400" />
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-white leading-tight">
            Indicadores de gestión (KPIs)
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 max-w-3xl mx-auto">
            Lo que se mide, se controla. Lo que se controla, mejora.
          </p>
        </div>
        
        {/* KPIs Grid 3x2 ORDENADO */}
        <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">
          {data.indicators.map((indicator, index) => (
            <StaggerItem key={index}>
              <motion.div
                whileHover={{ scale: 1.03, y: -5 }}
                className="glass-card rounded-xl p-6 border border-white/10 hover:border-teal-400/30 transition-all h-full"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex-1">
                    {indicator.name}
                  </h3>
                  <Target className="w-5 h-5 flex-shrink-0 text-teal-400" />
                </div>
                
                <p className="text-sm text-white/60 mb-4">
                  {indicator.description}
                </p>
                
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-xs text-white/50 mb-1">Target</p>
                    <p className="text-xl font-black text-teal-400">
                      {indicator.target}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-white/50 mb-1">Medición</p>
                    <p className="text-sm font-semibold text-white">
                      {indicator.measurement_frequency}
                    </p>
                  </div>
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>
        
        {/* Review note */}
        <div className="glass-card p-6 rounded-xl border border-white/10 text-center max-w-3xl mx-auto">
          <p className="text-base text-white">
            {data.review_note}
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
