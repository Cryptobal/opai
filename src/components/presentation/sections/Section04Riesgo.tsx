'use client';

/**
 * Section04Riesgo - El Riesgo Real con efectos dramáticos
 * Alert theme con red glows y animaciones impactantes
 */

import { Section04_Riesgo } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { AlertTriangle, XCircle, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section04RiesgoProps {
  data: Section04_Riesgo;
}

export function Section04Riesgo({ data }: Section04RiesgoProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s04-riesgo" className="section-darker relative overflow-hidden">
      {/* Red glow effects */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-red-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-3xl" />
      
      <ContainerWrapper size="xl" className="relative z-10">
        {/* Header dramático */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            whileInView={{ scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, type: 'spring', bounce: 0.5 }}
            className="inline-block mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-50 animate-pulse" />
              <AlertTriangle className="relative w-20 h-20 text-red-500" strokeWidth={2.5} />
            </div>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={cn(
              'text-4xl md:text-6xl lg:text-7xl font-black mb-10 max-w-5xl mx-auto',
              'text-white leading-tight'
            )}
          >
            {data.headline}
          </motion.h2>
          
          {/* Estadística impactante */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="inline-block relative"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/30 to-orange-500/30 rounded-2xl blur-xl" />
            <div className="relative glass-card px-10 py-8 rounded-2xl border-2 border-red-500/50 shadow-2xl shadow-red-500/20">
              <div className="flex items-center gap-4">
                <Zap className="w-8 h-8 text-red-500 animate-pulse" />
                <p className="text-2xl md:text-4xl font-black text-red-400">
                  {data.statistic}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
        
        {/* Síntomas grid con efectos dramáticos */}
        <div className="max-w-6xl mx-auto mb-16">
          <h3 className="text-3xl md:text-4xl font-black text-center mb-12 text-white">
            Síntomas de <span className="text-red-400">control deficiente</span>
          </h3>
          
          <StaggerContainer className="grid md:grid-cols-3 gap-8">
            {data.symptoms.map((symptom, index) => (
              <StaggerItem key={index}>
                <motion.div
                  whileHover={{ scale: 1.05, y: -10 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                  className="h-full group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
                  
                  <div className="relative glass-card rounded-2xl p-8 border-2 border-red-500/30 hover:border-red-500/60 transition-all h-full shadow-xl hover:shadow-2xl shadow-red-500/10">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center mb-6 shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform">
                      <XCircle className="w-9 h-9 text-white" strokeWidth={2.5} />
                    </div>
                    
                    <h4 className="text-2xl font-black mb-4 text-white">
                      {symptom.title}
                    </h4>
                    
                    <p className="text-base text-white/70 leading-relaxed">
                      {symptom.description}
                    </p>
                  </div>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
        
        {/* Bottom message impactante */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="glass-card rounded-2xl p-10 md:p-12 border-2 border-white/10">
            <p className="text-2xl md:text-3xl text-white/80 leading-relaxed">
              La pregunta no es{' '}
              <span className="font-black text-white">"¿tenemos seguridad?"</span>
              <br className="hidden md:block" />
              sino{' '}
              <span className="font-black bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                "¿tenemos control sobre nuestra seguridad?"
              </span>
            </p>
          </div>
        </motion.div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
