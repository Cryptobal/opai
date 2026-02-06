'use client';

/**
 * Section25Comparacion - Comparación competitiva premium
 * Tabla espectacular con highlights y efectos
 */

import { Section25_Comparacion } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Check, X, Shield, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface Section25ComparacionProps {
  data: Section25_Comparacion;
}

export function Section25Comparacion({ data }: Section25ComparacionProps) {
  const theme = useThemeClasses();
  
  const renderValue = (value: string | boolean) => {
    if (typeof value === 'boolean') {
      return value ? (
        <div className="flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/30">
            <Check className="w-6 h-6 text-white" strokeWidth={3} />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
            <X className="w-6 h-6 text-white" strokeWidth={3} />
          </div>
        </div>
      );
    }
    return <span className="font-semibold">{value}</span>;
  };
  
  return (
    <SectionWrapper id="s25-comparacion" className="section-gradient">
      <ContainerWrapper size="xl">
        {/* Header espectacular */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', duration: 0.8 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass-card border border-teal-400/30 glow-teal mb-8"
          >
            <Shield className="w-5 h-5 text-teal-400" />
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              Comparación Competitiva
            </span>
          </motion.div>
          
          <h2 className={cn(
            'text-4xl md:text-6xl lg:text-7xl font-black mb-6',
            'text-white leading-tight'
          )}>
            Por qué GARD{' '}
            <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
              no es "uno más"
            </span>
          </h2>
          
          <p className="text-xl md:text-2xl text-white/70 max-w-3xl mx-auto">
            Comparación honesta con el mercado tradicional
          </p>
        </div>
        
        {/* Callout */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <div className="glass-card rounded-2xl p-8 md:p-10 border-2 border-teal-400/30 glow-teal max-w-4xl mx-auto">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 flex items-center justify-center flex-shrink-0 glow-teal">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black mb-3 text-white">
                  No somos "commodity"
                </h3>
                <p className="text-lg text-white/80 leading-relaxed">
                  Mientras otros proveedores compiten por precio, nosotros competimos por valor: 
                  <span className="font-bold text-teal-400"> supervisión real, reportabilidad ejecutiva y cumplimiento garantizado</span>.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
        
        {/* Tabla comparativa premium (desktop) */}
        <div className="hidden md:block max-w-6xl mx-auto">
          <div className="glass-card rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl">
            <table className="w-full">
              <thead>
                <tr className="bg-white/5 border-b-2 border-white/10">
                  <th className="px-8 py-6 text-left font-black text-white text-xl">
                    Criterio
                  </th>
                  <th className="px-6 py-6 text-center font-black text-white/60 text-lg">
                    Mercado
                  </th>
                  <th className="px-8 py-6 text-center font-black text-lg bg-gradient-to-r from-teal-500/20 to-blue-500/20">
                    <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                      GARD
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.comparison_table.map((row, index) => (
                  <motion.tr
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05, duration: 0.5 }}
                    className={cn(
                      'border-b border-white/5',
                      row.highlight && 'bg-teal-500/10',
                      'hover:bg-white/5 transition-colors'
                    )}
                  >
                    <td className="px-8 py-5 font-semibold text-white text-base">
                      {row.criterion}
                    </td>
                    <td className="px-6 py-5 text-center text-white/60">
                      {renderValue(row.market)}
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className={cn(
                        row.highlight && 'relative',
                        row.highlight && 'after:absolute after:inset-0 after:bg-teal-400/5 after:rounded-lg after:-z-10'
                      )}>
                        {renderValue(row.gard)}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Cards mobile */}
        <div className="md:hidden space-y-4">
          {data.comparison_table.map((row, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                'glass-card rounded-xl p-5 border',
                row.highlight ? 'border-teal-400/50 bg-teal-500/5' : 'border-white/10'
              )}
            >
              <div className="font-bold text-white mb-4">{row.criterion}</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-white/50 mb-2">Mercado</div>
                  <div className="text-white/70">
                    {typeof row.market === 'boolean' ? (row.market ? '✓' : '✗') : row.market}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-teal-400 mb-2 font-semibold">GARD</div>
                  <div className="text-white font-bold">
                    {typeof row.gard === 'boolean' ? (row.gard ? '✓' : '✗') : row.gard}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        
        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <div className="glass-card inline-block p-8 rounded-2xl border border-white/10">
            <p className="text-xl font-bold text-white mb-6">
              ¿Quieres saber cómo nos comparamos con tu proveedor actual?
            </p>
            <a
              href="mailto:comercial@gard.cl?subject=Solicitud de comparación competitiva"
              className={cn(
                'btn-premium inline-flex items-center gap-3 px-8 py-4 rounded-xl',
                'text-base font-bold text-white',
                'bg-gradient-to-r from-teal-500 to-blue-500',
                'hover:from-teal-400 hover:to-blue-400',
                'shadow-xl shadow-teal-500/30',
                'border-2 border-teal-400/30',
                'transition-all duration-300 hover:scale-105'
              )}
            >
              Solicitar análisis comparativo
            </a>
          </div>
        </motion.div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
