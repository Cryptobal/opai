'use client';

/**
 * Section14Tecnologia - Feature cards modernas
 */

import { Section14_Tecnologia } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Smartphone, Camera, BarChart, Info } from 'lucide-react';
import { YouTubeEmbed, extractYouTubeId } from '../shared/YouTubeEmbed';
import { motion } from 'framer-motion';

interface Section14TecnologiaProps {
  data: Section14_Tecnologia;
}

export function Section14Tecnologia({ data }: Section14TecnologiaProps) {
  const theme = useThemeClasses();
  const icons = [Smartphone, Camera, BarChart];
  
  return (
    <SectionWrapper id="s14-tecnologia" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <Smartphone className="w-14 h-14 mx-auto mb-6 text-teal-400" />
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-white leading-tight">
            Tecnología que controla
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 max-w-3xl mx-auto">
            No vendemos tecnología. La usamos para verificar cumplimiento.
          </p>
        </div>
        
        {/* Tools grid - 3 COLUMNAS COMPACTAS */}
        <StaggerContainer className="grid md:grid-cols-3 gap-6 mb-12">
          {data.tools.map((tool, index) => {
            const Icon = icons[index % icons.length];
            
            return (
              <StaggerItem key={index}>
                <motion.div
                  whileHover={{ scale: 1.03, y: -5 }}
                  className="glass-card rounded-2xl p-6 border border-white/10 hover:border-teal-400/30 transition-all h-full group"
                >
                  {/* Icon grande */}
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                    <Icon className="w-8 h-8 text-teal-400" />
                  </div>
                  
                  {/* Título */}
                  <h3 className="text-lg font-black text-white mb-4">
                    {tool.name}
                  </h3>
                  
                  {/* Info grid */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1">
                        ¿Qué es?
                      </p>
                      <p className="text-sm text-white/80">
                        {tool.what_is_it}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1">
                        ¿Para qué?
                      </p>
                      <p className="text-sm text-white/80">
                        {tool.purpose}
                      </p>
                    </div>
                    
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">
                        Beneficio real
                      </p>
                      <p className="text-sm font-bold text-white">
                        {tool.real_benefit}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
        
        {/* Video */}
        <div className="mb-12 max-w-4xl mx-auto">
          <h3 className="text-xl font-bold text-center mb-6 text-white">
            Sistema en funcionamiento
          </h3>
          <YouTubeEmbed 
            videoId={extractYouTubeId('https://youtu.be/rGbyIwpIkYU')}
            title="Control de acceso"
          />
        </div>
        
        {/* Note */}
        <div className="glass-card p-6 rounded-xl border border-teal-400/30 text-center max-w-3xl mx-auto">
          <Info className="w-8 h-8 mx-auto mb-3 text-teal-400" />
          <p className="text-base font-semibold text-white">
            {data.note}
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
