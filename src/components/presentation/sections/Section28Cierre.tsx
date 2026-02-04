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
        <div className="text-center max-w-5xl mx-auto px-4">
          {/* Headline épico */}
          <motion.h2
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, type: 'spring' }}
            className="text-5xl md:text-7xl lg:text-8xl font-black mb-8 text-white leading-[1.1] tracking-tight text-shadow-lg"
          >
            {data.headline}
          </motion.h2>
          
          {/* Microcopy con gradient */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-2xl md:text-4xl mb-16 font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent max-w-3xl mx-auto"
          >
            {data.microcopy}
          </motion.p>
          
          {/* CTAs épicos */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-6 justify-center mb-12"
          >
            <a
              href={data.cta_primary.link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'btn-premium group relative overflow-hidden',
                'inline-flex items-center justify-center gap-4',
                'px-12 py-6 rounded-2xl',
                'text-xl md:text-2xl font-black text-white',
                'bg-gradient-to-r from-teal-500 to-teal-400',
                'hover:from-teal-400 hover:to-teal-300',
                'transition-all duration-300',
                'hover:scale-110',
                'shadow-2xl shadow-teal-500/50 hover:shadow-teal-500/80',
                'border-4 border-teal-400/50 hover:border-teal-300/70',
                'glow-teal-strong'
              )}
            >
              <Sparkles className="w-6 h-6 animate-pulse" />
              <Calendar className="w-7 h-7" />
              <span>{data.cta_primary.text}</span>
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </a>
            
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'group',
                'inline-flex items-center justify-center gap-4',
                'px-12 py-6 rounded-2xl',
                'text-xl md:text-2xl font-black text-white',
                'bg-green-600 hover:bg-green-500',
                'border-4 border-green-500/50 hover:border-green-400',
                'transition-all duration-300 hover:scale-105',
                'shadow-2xl shadow-green-600/30'
              )}
            >
              <MessageCircle className="w-7 h-7" />
              <span>Hablar por WhatsApp</span>
            </a>
          </motion.div>
          
          {/* Trust indicators con animación */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-8 text-base"
          >
            {[
              'Respuesta en 24 horas hábiles',
              'Visita técnica sin costo',
              'Sin compromiso'
            ].map((text, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.8 + index * 0.1, type: 'spring' }}
                className="flex items-center gap-3 glass-card px-5 py-3 rounded-full border border-white/10"
              >
                <CheckCircle2 className="w-5 h-5 text-teal-400" />
                <span className="font-semibold text-white">{text}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
