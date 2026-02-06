'use client';

/**
 * Section19Resultados - Casos de éxito premium
 * Con animaciones y efectos glassmorphism
 */

import { Section19_Resultados } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { CaseStudyGrid } from '../shared/CaseStudyCard';
import { TrendingUp, Sparkles } from 'lucide-react';
import { AnimatedStatsGrid } from '../shared/AnimatedStat';
import { motion } from 'framer-motion';

interface Section19ResultadosProps {
  data: Section19_Resultados;
}

export function Section19Resultados({ data }: Section19ResultadosProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s19-resultados" className="section-dark">
      <ContainerWrapper size="xl">
        {/* Header espectacular */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ scale: 0, rotate: 180 }}
            whileInView={{ scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, type: 'spring' }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass-card border border-teal-400/30 glow-teal mb-8"
          >
            <TrendingUp className="w-5 h-5 text-teal-400" />
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              Casos de Éxito
            </span>
          </motion.div>
          
          <h2 className={cn(
            'text-4xl md:text-6xl lg:text-7xl font-black mb-6',
            'text-white leading-tight'
          )}>
            Resultados con{' '}
            <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
              clientes reales
            </span>
          </h2>
          
          <p className="text-xl md:text-2xl text-white/70 max-w-3xl mx-auto">
            Empresas que han transformado su operación de seguridad con resultados medibles
          </p>
        </div>
        
        {/* Stats generales espectaculares */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mb-20"
        >
          <div className="glass-card rounded-3xl p-10 md:p-16 border-2 border-teal-400/20 glow-teal">
            <AnimatedStatsGrid
              stats={[
                { value: 73, label: 'Reducción promedio de incidentes', suffix: '%' },
                { value: 98, label: 'Cumplimiento de rondas', suffix: '%' },
                { value: 4.7, label: 'Satisfacción promedio', decimals: 1, suffix: '/5' },
                { value: 94, label: 'Tasa de renovación', suffix: '%' },
              ]}
              columns={4}
            />
          </div>
        </motion.div>
        
        {/* Case Studies - Grid 2x2 */}
        <StaggerContainer>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {data.case_studies.map((caseStudy, index) => (
              <StaggerItem key={index}>
                <motion.div
                  whileHover={{ scale: 1.05, y: -10 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className="h-full"
                >
                  <div className="glass-card rounded-2xl p-8 border-2 border-white/10 hover:border-teal-400/30 transition-all h-full shadow-xl hover:shadow-2xl">
                    {/* Sector badge */}
                    <div className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6',
                      'bg-gradient-to-r from-teal-500 to-blue-500 text-white',
                      'text-sm font-bold shadow-lg'
                    )}>
                      <Sparkles className="w-4 h-4" />
                      {caseStudy.sector}
                    </div>
                    
                    {/* Detalles */}
                    <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-white/10">
                      <div>
                        <div className="text-sm text-white/50 mb-1">Instalaciones</div>
                        <div className="text-3xl font-black text-white">{caseStudy.sites}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-sm text-white/50 mb-1">Dotación</div>
                        <div className="text-lg font-bold text-white">{caseStudy.staffing}</div>
                      </div>
                    </div>
                    
                    {/* Métricas mini */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {caseStudy.metrics.slice(0, 4).map((metric, i) => (
                        <div key={i} className="glass-card p-4 rounded-lg border border-white/5 hover:border-teal-400/30 transition-colors">
                          <div className="text-2xl font-black bg-gradient-to-br from-teal-400 to-blue-400 bg-clip-text text-transparent">
                            {metric.value}
                          </div>
                          <div className="text-xs text-white/70">{metric.label}</div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Quote */}
                    <div className="glass-card p-4 rounded-lg border border-teal-400/20 bg-teal-500/5">
                      <p className="text-sm italic text-white/80">"{caseStudy.quote}"</p>
                    </div>
                  </div>
                </motion.div>
              </StaggerItem>
            ))}
          </div>
        </StaggerContainer>
        
        {/* Nota */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <p className="text-sm text-white/50 max-w-2xl mx-auto">
            Algunos clientes prefieren mantener confidencialidad por políticas internas.
            <br />
            Referencias disponibles bajo solicitud y NDA.
          </p>
        </motion.div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
