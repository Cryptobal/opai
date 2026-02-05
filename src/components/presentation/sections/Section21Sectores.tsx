'use client';

/**
 * Section21Sectores - Con imágenes de fondo
 */

import { Section21_Sectores } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface Section21SectoresProps {
  data: Section21_Sectores;
}

// Mapeo de industrias a imágenes
const industryImages: Record<string, string> = {
  'Logística y Bodegas': '/industria_bodegas.webp',
  'Manufactura e Industria': '/industria_mineria.webp',
  'Retail y Centros Comerciales': '/industria_retail.webp',
  'Construcción e Inmobiliaria': '/industria_construccion.webp',
  'Salud y Clínicas': '/industria_salud.jpeg',
  'Educación': '/industria_educacion.webp',
};

export function Section21Sectores({ data }: Section21SectoresProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s21-sectores">
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
              Experiencia Vertical
            </span>
          </motion.div>
          
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-white leading-tight">
            Sectores donde aplicamos
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
            Experiencia probada en múltiples industrias
          </p>
        </div>
        
        {/* Industries grid con IMÁGENES */}
        <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.industries.map((industry, index) => {
            const bgImage = industryImages[industry.name] || '/industria_bodegas.webp';
            
            return (
              <StaggerItem key={index}>
                <motion.div
                  whileHover={{ scale: 1.03, y: -8 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className="relative rounded-2xl overflow-hidden border-2 border-white/10 hover:border-teal-400/50 transition-all group h-full shadow-xl hover:shadow-2xl"
                >
                  {/* Background image */}
                  <div className="absolute inset-0">
                    <Image
                      src={bgImage}
                      alt={industry.name}
                      fill
                      className="object-cover brightness-50 group-hover:brightness-75 group-hover:scale-110 transition-all duration-500"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                    {/* Overlay gradient SUTIL pero visible */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/60" />
                    <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10 p-8 flex flex-col h-full min-h-[280px]">
                    <h3 className="text-2xl font-black text-white mb-4 group-hover:text-teal-400 transition-colors">
                      {industry.name}
                    </h3>
                    
                    <ul className="space-y-2 flex-1">
                      {industry.typical_needs.map((need, i) => (
                        <li key={i} className="text-sm text-white/80 flex items-start gap-2 leading-snug">
                          <span className="text-teal-400 mt-0.5">✓</span>
                          <span>{need}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
        
        {/* Nota */}
        <div className="mt-12 text-center">
          <p className="text-base text-white/70 max-w-2xl mx-auto">
            Cada industria tiene desafíos únicos. Diseñamos el servicio según tus necesidades específicas.
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
