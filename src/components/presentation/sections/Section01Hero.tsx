'use client';

/**
 * Section01Hero - Hero que cabe PERFECTO en una pantalla
 * TODO visible sin scroll
 */

import { Section01_Hero, PresentationPayload } from '@/types/presentation';
import { SectionWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { usePdfMode } from '../PdfModeContext';
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
  const pdfMode = usePdfMode();
  
  const headline = showTokens ? data.headline : replaceTokens(data.headline, payload);
  const subheadline = showTokens ? data.subheadline : replaceTokens(data.subheadline, payload);
  const microcopy = showTokens ? data.microcopy : replaceTokens(data.microcopy, payload);
  const personalization = showTokens ? data.personalization : replaceTokens(data.personalization, payload);
  const contactName = showTokens ? '[CONTACT_NAME]' : payload.client.contact_name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payloadAny = payload as any;
  const dealName: string = payloadAny._dealName || '';
  const installationName: string = payloadAny._installationName || payload.service?.sites?.[0]?.name || '';
  
  // Componentes: en PDF mode usar divs planos, en web usar motion
  const H1 = pdfMode ? 'h1' : motion.h1;
  const P = pdfMode ? 'p' : motion.p;
  const Div = pdfMode ? 'div' : motion.div;
  
  return (
    <SectionWrapper id="s01-hero" animation="none" className="relative overflow-hidden p-0">
      {/* Background Image - SOLO en esta sección */}
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
        {/* Overlay gradient MUY FUERTE para corte limpio */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-slate-950/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
        {/* Gradient extra en bottom para corte TOTAL */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
        
        {/* Glows - sin animate-pulse en PDF */}
        <div className={`absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl ${!pdfMode ? 'animate-pulse' : ''}`} />
        <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl ${!pdfMode ? 'animate-pulse' : ''}`} style={!pdfMode ? { animationDelay: '1s' } : undefined} />
      </div>
      
      {/* Content */}
      <div className="relative z-10 min-h-[85vh] flex items-center px-4 sm:px-6 md:px-12 py-32 md:py-40 max-w-6xl mx-auto">
        <div className="w-full max-w-5xl">
          
          {/* PDF: Info del documento (cliente, contacto, propuesta) */}
          {pdfMode && (
            <div className="mb-8 glass-card rounded-xl p-5 border border-teal-400/20 inline-block">
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div><span className="text-white/50">Preparado para:</span> <span className="font-bold text-white">{payload.client.company_name}</span></div>
                {contactName && contactName !== '[CONTACT_NAME]' && (
                  <div><span className="text-white/50">Contacto:</span> <span className="font-bold text-white">{contactName}</span></div>
                )}
                <div><span className="text-white/50">Propuesta:</span> <span className="font-bold text-teal-400">{payload.quote.subject || `COT ${payload.quote.number}`}</span></div>
                {dealName && (
                  <div><span className="text-white/50">Negocio:</span> <span className="font-bold text-white">{dealName}</span></div>
                )}
                {installationName && (
                  <div><span className="text-white/50">Instalacion:</span> <span className="font-bold text-white">{installationName}</span></div>
                )}
              </div>
            </div>
          )}
          
          {/* Headline */}
          <H1
            {...(!pdfMode ? { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.2, duration: 0.8 } } : {})}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black mb-3 text-white leading-[1.1] tracking-tight text-shadow-lg"
          >
            {headline}
          </H1>
          
          {/* Subheadline */}
          <P
            {...(!pdfMode ? { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.4, duration: 0.8 } } : {})}
            className="text-base sm:text-lg md:text-xl lg:text-2xl mb-3 font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent max-w-3xl"
          >
            {subheadline}
          </P>
          
          {/* Microcopy */}
          <P
            {...(!pdfMode ? { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.6, duration: 0.8 } } : {})}
            className="text-sm sm:text-base text-white/70 mb-8 max-w-2xl leading-relaxed"
          >
            {microcopy}
          </P>
          
          {/* KPIs de Valor */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {[
              { value: '67%', label: 'Reducción incidentes' },
              { value: '96%', label: 'Rondas cumplidas' },
              { value: '100%', label: 'Eventos documentados' },
              { value: '24h', label: 'Respuesta consultas' },
            ].map((kpi, i) => (
              <div
                key={i}
                className="glass-card p-4 rounded-xl border border-teal-400/20 text-center"
              >
                <div className="text-3xl font-black bg-gradient-to-br from-teal-400 to-blue-400 bg-clip-text text-transparent mb-1">
                  {kpi.value}
                </div>
                <div className="text-xs sm:text-sm text-white/70 font-semibold">
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
