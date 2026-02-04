'use client';

/**
 * Section01Hero - Hero espectacular tipo Qwilr
 * Full screen con parallax, gradientes y CTAs premium
 */

import { Section01_Hero, PresentationPayload } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { replaceTokens } from '@/lib/tokens';
import Image from 'next/image';
import { Calendar, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section01HeroProps {
  data: Section01_Hero;
  payload: PresentationPayload;
}

export function Section01Hero({ data, payload }: Section01HeroProps) {
  const theme = useThemeClasses();
  
  // Reemplazar tokens
  const headline = replaceTokens(data.headline, payload);
  const subheadline = replaceTokens(data.subheadline, payload);
  const microcopy = replaceTokens(data.microcopy, payload);
  const personalization = replaceTokens(data.personalization, payload);
  
  return (
    <SectionWrapper id="s01-hero" animation="none" className="relative overflow-hidden p-0">
      {/* Background Image con overlay VISIBLE */}
      <div className="absolute inset-0 z-0">
        <Image
          src={data.background_image}
          alt="Hero background"
          fill
          className="object-cover brightness-75"
          priority
          quality={95}
          sizes="100vw"
        />
        {/* Gradient overlay MÁS SUAVE para ver la imagen */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-slate-950/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-900/30" />
        
        {/* Glow effects MÁS FUERTES */}
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-teal-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      
      {/* Content */}
      <ContainerWrapper size="xl" className="relative z-10 flex flex-col justify-center py-32 md:py-40 min-h-[85vh] md:min-h-screen">
        {/* KPI Overlay (esquina superior derecha) con glassmorphism */}
        {data.kpi_overlay && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="absolute top-12 right-8 hidden lg:block"
          >
            <div className="glass-card p-6 glow-teal">
              <div className="text-5xl font-black mb-2 bg-gradient-to-br from-teal-400 to-blue-400 bg-clip-text text-transparent">
                {data.kpi_overlay.value}
              </div>
              <div className="text-sm font-semibold text-white/80">
                {data.kpi_overlay.label}
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Main Content */}
        <div className="max-w-5xl">
          {/* Personalization badge con glow */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mb-8"
          >
            <span className={cn(
              'inline-flex items-center gap-2 px-5 py-2.5 rounded-full',
              'glass-card text-sm font-bold text-white',
              'border border-teal-400/30 glow-teal'
            )}>
              <Sparkles className="w-4 h-4 text-teal-400" />
              {personalization}
            </span>
          </motion.div>
          
          {/* Headline espectacular */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className={cn(
              'text-5xl md:text-7xl lg:text-8xl font-black mb-8',
              'text-white leading-[1.1] tracking-tight',
              'text-shadow-lg'
            )}
          >
            {headline}
          </motion.h1>
          
          {/* Subheadline con gradient */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="text-2xl md:text-3xl lg:text-4xl mb-6 font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent"
          >
            {subheadline}
          </motion.p>
          
          {/* Microcopy */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="text-lg md:text-xl text-white/70 mb-12 max-w-3xl leading-relaxed"
          >
            {microcopy}
          </motion.p>
          
          {/* CTAs premium con animaciones */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-5"
          >
            <a
              href={payload.cta.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'btn-premium group',
                'inline-flex items-center justify-center gap-3',
                'px-10 py-5 rounded-xl',
                'text-lg font-bold text-white',
                'bg-gradient-to-r from-teal-500 to-teal-400',
                'hover:from-teal-400 hover:to-teal-300',
                'transition-all duration-300',
                'hover:scale-105 hover:shadow-2xl',
                'glow-teal-strong',
                'border-2 border-teal-400/50'
              )}
            >
              <Calendar className="w-6 h-6" />
              {data.cta_primary_text}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            
            <a
              href={`mailto:${payload.contact.email}`}
              className={cn(
                'inline-flex items-center justify-center gap-3',
                'px-10 py-5 rounded-xl',
                'text-lg font-bold text-white',
                'glass-card border-2 border-white/30',
                'hover:bg-white/20 hover:border-white/50',
                'transition-all duration-300 hover:scale-105'
              )}
            >
              {data.cta_secondary_text}
              <ArrowRight className="w-5 h-5" />
            </a>
          </motion.div>
          
          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="flex flex-wrap items-center gap-6 mt-12 text-sm text-white/60"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span>Sin costo ni compromiso</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
              <span>Respuesta en 24h</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" style={{ animationDelay: '1s' }} />
              <span>Visita técnica incluida</span>
            </div>
          </motion.div>
        </div>
        
        {/* Scroll indicator animado */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1, repeat: Infinity, repeatType: 'reverse' }}
          className="absolute bottom-12 left-1/2 transform -translate-x-1/2 hidden md:block"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-white/40 text-xs font-semibold tracking-widest uppercase">Scroll</span>
            <ArrowRight className="w-6 h-6 text-white/40 rotate-90" />
          </div>
        </motion.div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
