'use client';

/**
 * Section20Clientes - Grid de logos con contadores espectaculares
 * Prueba social con efectos premium
 */

import { Section20_Clientes } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Shield, TrendingUp } from 'lucide-react';
import { AnimatedStatsGrid } from '../shared/AnimatedStat';
import { motion } from 'framer-motion';

interface Section20ClientesProps {
  data: Section20_Clientes;
}

export function Section20Clientes({ data }: Section20ClientesProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s20-clientes" className="section-gradient">
      <ContainerWrapper size="xl">
        {/* Header espectacular */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            whileInView={{ scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, type: 'spring' }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-8 bg-gradient-to-br from-teal-500 to-blue-500 glow-teal-strong"
          >
            <Shield className="w-10 h-10 text-white" strokeWidth={2.5} />
          </motion.div>
          
          <h2 className={cn(
            'text-4xl md:text-6xl lg:text-7xl font-black mb-6',
            'text-white leading-tight'
          )}>
            Empresas que{' '}
            <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
              confían
            </span>{' '}
            en nosotros
          </h2>
          
          <p className="text-xl md:text-2xl text-white/70 max-w-3xl mx-auto">
            Protegemos operaciones críticas en diversos sectores industriales
          </p>
        </div>
        
        {/* Stats espectaculares con contadores */}
        <div className="mb-20">
          <AnimatedStatsGrid
            stats={[
              { value: 200, label: 'Clientes activos', suffix: '+' },
              { value: 15, label: 'Años de experiencia', suffix: '+' },
              { value: 98, label: 'Tasa de retención', suffix: '%' },
              { value: 24, label: 'Soporte disponible', suffix: '/7' },
            ]}
            columns={4}
          />
        </div>
        
        {/* Grid de logos con efectos premium */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-10 text-white/90">
            Clientes destacados
          </h3>
          
          <div className="grid grid-cols-3 md:grid-cols-5 gap-6">
            {data.client_logos.map((logo, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                whileHover={{ scale: 1.05, y: -5 }}
                className="relative group"
              >
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/0 to-blue-500/0 group-hover:from-teal-500/20 group-hover:to-blue-500/20 rounded-xl blur-xl transition-all duration-500" />
                
                <div className={cn(
                  'relative h-32 rounded-xl glass-card border-2',
                  'border-white/10 group-hover:border-teal-400/40',
                  'p-6 flex items-center justify-center',
                  'transition-all duration-300',
                  'shadow-xl group-hover:shadow-2xl'
                )}>
                  <Image
                    src={logo}
                    alt={`Cliente ${index + 1}`}
                    fill
                    className="object-contain p-4 grayscale group-hover:grayscale-0 transition-all duration-500 brightness-90 group-hover:brightness-110"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        
        {/* Nota de confidencialidad con estilo */}
        {data.confidentiality_note && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="glass-card px-6 py-4 rounded-lg border border-white/10">
              <p className="text-sm text-white/60 italic">
                {data.confidentiality_note}
              </p>
            </div>
          </motion.div>
        )}
      </ContainerWrapper>
    </SectionWrapper>
  );
}
