'use client';

/**
 * Section01Hero - Hero que cabe PERFECTO en una pantalla
 * TODO visible sin scroll
 */

import { Section01_Hero, PresentationPayload } from '@/types/presentation';
import { SectionWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { replaceTokens } from '@/lib/tokens';
import Image from 'next/image';
import { Calendar, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section01HeroProps {
  data: Section01_Hero;
  payload: PresentationPayload;
  showTokens?: boolean;
}

export function Section01Hero({ data, payload, showTokens = false }: Section01HeroProps) {
  const theme = useThemeClasses();
  
  const headline = showTokens ? data.headline : replaceTokens(data.headline, payload);
  const subheadline = showTokens ? data.subheadline : replaceTokens(data.subheadline, payload);
  const microcopy = showTokens ? data.microcopy : replaceTokens(data.microcopy, payload);
  const personalization = showTokens ? data.personalization : replaceTokens(data.personalization, payload);
  const contactName = showTokens ? '[CONTACT_NAME]' : payload.client.contact_name;
  
  return (
    <SectionWrapper id="s01-hero" animation="none" className="relative overflow-hidden p-0">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src={data.background_image}
          alt="Hero background"
          fill
          className="object-cover brightness-75"
          priority
          quality={90}
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-slate-950/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-900/30" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      
      {/* Content - OPTIMIZADO SIN BADGE (va en header) */}
      <div className="relative z-10 h-screen flex flex-col justify-center px-4 sm:px-6 md:px-12 max-w-6xl mx-auto">
        {/* Main Content - SIN BADGE */}
        <div className="w-full max-w-5xl">
          
          {/* Headline - OPTIMIZADO */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-4 text-white leading-[1.1] tracking-tight text-shadow-lg"
          >
            {headline}
          </motion.h1>
          
          {/* Subheadline - OPTIMIZADO */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-lg sm:text-xl md:text-2xl lg:text-3xl mb-4 font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent max-w-3xl"
          >
            {subheadline}
          </motion.p>
          
          {/* Microcopy - OPTIMIZADO */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="text-base sm:text-lg text-white/70 mb-8 max-w-3xl leading-relaxed"
          >
            {microcopy}
          </motion.p>
          
          {/* CTAs - OPTIMIZADOS */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <a
              href={payload.cta.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-premium inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 transition-all duration-300 hover:scale-105 shadow-xl shadow-teal-500/50 border-2 border-teal-400/50"
            >
              <Calendar className="w-5 h-5" />
              <span>{data.cta_primary_text}</span>
              <ArrowRight className="w-5 h-5" />
            </a>
            
            <a
              href={`mailto:${payload.contact.email}`}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white glass-card border-2 border-white/30 hover:bg-white/20 hover:border-white/50 transition-all duration-300 hover:scale-105"
            >
              <span>{data.cta_secondary_text}</span>
              <ArrowRight className="w-5 h-5" />
            </a>
          </motion.div>
          
          {/* Trust indicators - OPTIMIZADO */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="flex flex-wrap items-center gap-4 mt-6 text-sm text-white/70"
          >
            {['✓ Sin costo', '✓ Respuesta 24h', '✓ Visita incluida'].map((text, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" style={{ animationDelay: `${i * 0.5}s` }} />
                <span className="font-semibold">{text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </SectionWrapper>
  );
}
