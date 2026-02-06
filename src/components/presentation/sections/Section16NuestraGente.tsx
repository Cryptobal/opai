'use client';

/**
 * Section16NuestraGente - Mejorado con shadows e icons modernos
 */

import { Section16_NuestraGente } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Heart, Target, Shield, Users, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section16NuestraGenteProps {
  data: Section16_NuestraGente;
}

const valueIcons = [Target, Shield, Heart, Users, Zap];

export function Section16NuestraGente({ data }: Section16NuestraGenteProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s16-nuestra-gente" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <Heart className="w-14 h-14 mx-auto mb-6 text-teal-400" />
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-white leading-tight">
            Nuestra gente
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-8">
            {data.message}
          </p>
        </div>
        
        {/* Photo mosaic - MÁS FOTOS CON SHADOWS */}
        <div className="mb-16">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.photos.map((photo, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05, duration: 0.5 }}
                whileHover={{ scale: 1.05, y: -5 }}
                className="relative group"
              >
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-white/10 shadow-xl group-hover:shadow-2xl group-hover:shadow-teal-500/20 transition-all">
                  <Image
                    src={photo}
                    alt={`Equipo ${index + 1}`}
                    fill
                    className="object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-500 brightness-90 group-hover:brightness-110"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                  />
                  {/* Overlay suave */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        
        {/* Valores con ICONS MODERNOS */}
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-8 text-white">
            Nuestros valores
          </h3>
          
          <StaggerContainer className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {data.values.map((value, index) => {
              const Icon = valueIcons[index % valueIcons.length];
              
              return (
                <StaggerItem key={index}>
                  <div className="glass-card rounded-xl p-5 text-center h-full border border-white/10 hover:border-teal-400/30 transition-all group hover:scale-105">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6 text-teal-400" />
                    </div>
                    <h4 className="text-sm font-bold text-white mb-2">
                      {value.title}
                    </h4>
                    <p className="text-xs text-white/60 leading-snug">
                      {value.description}
                    </p>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
        
        {/* Stat permanencia */}
        <div className="mt-12 text-center">
          <div className="inline-block glass-card px-8 py-5 rounded-xl border border-teal-400/30 glow-teal">
            <p className="text-sm font-semibold text-white/70 mb-2">
              Permanencia promedio
            </p>
            <p className="text-5xl font-black bg-gradient-to-br from-teal-400 to-blue-400 bg-clip-text text-transparent">
              85%
            </p>
            <p className="text-sm text-white/60 mt-2">
              vs industria: 50-60%
            </p>
          </div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
