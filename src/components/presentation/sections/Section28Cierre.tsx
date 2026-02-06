'use client';

/**
 * Section28Cierre - CTA Final espectacular
 * Full screen con animaciones y gradientes impactantes
 */

import { Section28_Cierre } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Calendar, MessageCircle, ArrowRight, Sparkles, Zap, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section28CierreProps {
  data: Section28_Cierre;
}

interface Section28CierrePropsExtended {
  data: Section28_Cierre;
  contactEmail?: string;
  contactPhone?: string;
}

export function Section28Cierre({ data, contactEmail = 'carlos.irigoyen@gard.cl', contactPhone = '+56982307771' }: Section28CierrePropsExtended) {
  const theme = useThemeClasses();
  
  // WhatsApp link para hablar con quien envió la propuesta
  const whatsappLink = `https://wa.me/56982307771?text=${encodeURIComponent('Hola, vi la propuesta y me gustaría conversar')}`;
  
  return (
    <SectionWrapper id="s28-cierre" animation="scale" className="relative overflow-hidden">
      {/* Background espectacular con múltiples gradientes */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-transparent to-blue-500/10" />
      
      {/* Glows animados */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-teal-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      
      {/* Particulas decorativas */}
      <Sparkles className="absolute top-20 right-20 w-8 h-8 text-teal-400/30 animate-pulse" />
      <Zap className="absolute bottom-20 left-20 w-10 h-10 text-blue-400/30 animate-pulse" style={{ animationDelay: '0.5s' }} />
      
      <ContainerWrapper className="relative z-10 py-24 md:py-32">
        <div className="text-center max-w-5xl mx-auto w-full">
          {/* Headline épico - RESPONSIVE */}
          <motion.h2
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, type: 'spring' }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black mb-6 sm:mb-8 text-white leading-[1.1] tracking-tight text-shadow-lg px-4"
          >
            {data.headline}
          </motion.h2>
          
          {/* Microcopy - RESPONSIVE */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-lg sm:text-xl md:text-2xl lg:text-3xl mb-10 sm:mb-14 font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent max-w-3xl mx-auto px-4"
          >
            {data.microcopy}
          </motion.p>
          
          {/* CTAs - MINIMALISTAS con animaciones ESPECTACULARES */}
          <div className="flex flex-col sm:flex-row gap-5 justify-center mb-12 px-4">
            {/* CTA 1: Agendar */}
            <motion.a
              href={data.cta_primary.link}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, x: -100, scale: 0.8 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ 
                delay: 0.3, 
                duration: 0.8,
                type: 'spring',
                stiffness: 100
              }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group relative overflow-hidden inline-flex items-center justify-center gap-3 px-10 py-5 rounded-2xl text-lg font-bold text-white bg-white/5 backdrop-blur-xl border-2 border-teal-400/50 hover:border-teal-400 transition-all shadow-xl hover:shadow-2xl hover:shadow-teal-500/50"
            >
              {/* Glow background on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500/0 via-teal-500/20 to-teal-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              
              {/* Content */}
              <Calendar className="w-6 h-6 text-teal-400 group-hover:scale-110 transition-transform relative z-10" />
              <span className="relative z-10">{data.cta_primary.text}</span>
              <ArrowRight className="w-5 h-5 text-teal-400 group-hover:translate-x-2 transition-transform relative z-10" />
            </motion.a>
            
            {/* CTA 2: WhatsApp */}
            <motion.a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, x: 100, scale: 0.8 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ 
                delay: 0.5, 
                duration: 0.8,
                type: 'spring',
                stiffness: 100
              }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group relative overflow-hidden inline-flex items-center justify-center gap-3 px-10 py-5 rounded-2xl text-lg font-bold text-white bg-white/5 backdrop-blur-xl border-2 border-green-500/50 hover:border-green-500 transition-all shadow-xl hover:shadow-2xl hover:shadow-green-500/50"
            >
              {/* Glow background on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/20 to-green-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              
              {/* Content */}
              <MessageCircle className="w-6 h-6 text-green-400 group-hover:scale-110 transition-transform relative z-10" />
              <span className="relative z-10">Hablar por WhatsApp</span>
            </motion.a>
          </div>
          
          {/* Trust indicators - RESPONSIVE */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4 text-sm sm:text-base px-4"
          >
            {[
              'Respuesta en 24h',
              'Visita sin costo',
              'Sin compromiso'
            ].map((text, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.8 + index * 0.1, type: 'spring' }}
                className="flex items-center gap-2 glass-card px-4 py-2 sm:px-5 sm:py-3 rounded-full border border-white/10"
              >
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-teal-400 flex-shrink-0" />
                <span className="font-semibold text-white whitespace-nowrap">{text}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
