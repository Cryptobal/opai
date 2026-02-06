'use client';

/**
 * Section02ExecutiveSummary - REDISEÑO POTENTE
 * Con personalización de Zoho CRM y CTAs estratégicos
 */

import { Section02_ExecutiveSummary } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { KpiGrid } from '../shared/KpiCard';
import { CheckCircle, XCircle, Sparkles, DollarSign, TrendingUp, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { ZohoToken } from '../ZohoToken';

interface Section02ExecutiveSummaryProps {
  data: Section02_ExecutiveSummary;
  quoteDescription?: string;
  companyName?: string;
  industry?: string;
  sitesCount?: number;
  coverageHours?: string;
  showTokens?: boolean;
}

export function Section02ExecutiveSummary({ 
  data, 
  quoteDescription = '',
  companyName = 'tu empresa',
  industry = '',
  sitesCount = 0,
  coverageHours = '',
  showTokens = false
}: Section02ExecutiveSummaryProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s02-executive-summary" className="section-darker">
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass-card border border-teal-400/30 glow-teal mb-8"
          >
            <Sparkles className="w-5 h-5 text-teal-400" />
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              Resumen Ejecutivo
            </span>
          </motion.div>
          
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 text-white leading-tight">
            {data.commitment_title}
          </h2>
        </div>
        
        {/* NUEVO: Propuesta Personalizada */}
        {quoteDescription && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <div className="glass-card rounded-2xl p-8 md:p-10 border-2 border-teal-400/30 glow-teal max-w-5xl mx-auto">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white mb-2 flex items-center gap-2 flex-wrap">
                    <span>Propuesta personalizada para</span>
                    {showTokens ? (
                      <ZohoToken token="account.Account_Name" inline />
                    ) : (
                      <span>{companyName}</span>
                    )}
                  </h3>
                  <p className="text-sm text-teal-400 font-semibold">
                    Diseñada específicamente para sus necesidades
                  </p>
                </div>
              </div>
              
              <div className="prose prose-invert max-w-none">
                <p className="text-base text-white/90 leading-relaxed">
                  {showTokens ? (
                    <ZohoToken token="quote.Descripcion_AI" />
                  ) : (
                    quoteDescription
                  )}
                </p>
              </div>
              
              {/* Contexto adicional - Solo Cobertura */}
              <div className="flex justify-center mt-6 pt-6 border-t border-white/10">
                <div className="text-center">
                  <div className="text-sm text-white/50 mb-1">Cobertura</div>
                  <div className="text-lg font-black bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                    {showTokens ? (
                      <ZohoToken token="Calculado dinámicamente" inline />
                    ) : (
                      coverageHours
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Por Qué GARD vs Modelo Tradicional - SIMÉTRICAS */}
        <div className="grid lg:grid-cols-2 gap-8 mb-16 items-stretch">
          {/* GARD - MÁS FUERTE */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-blue-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
            
            <div className="relative glass-card rounded-2xl p-8 border-2 border-teal-400/30 hover:border-teal-400/50 transition-all h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center glow-teal">
                  <CheckCircle className="w-7 h-7 text-white" strokeWidth={3} />
                </div>
                <h3 className="text-2xl font-black text-white">
                  Por qué GARD
                </h3>
              </div>
              
              <div className="space-y-3">
                {data.differentiators.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 group/item">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-teal-400 group-hover/item:scale-110 transition-transform" strokeWidth={2.5} />
                    <span className="text-base text-white/90 font-medium leading-relaxed">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
          
          {/* Modelo Tradicional */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
            
            <div className="relative glass-card rounded-2xl p-8 border-2 border-red-500/30 hover:border-red-500/50 transition-all h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
                  <XCircle className="w-7 h-7 text-white" strokeWidth={3} />
                </div>
                <h3 className="text-2xl font-black text-white">
                  Modelo tradicional
                </h3>
              </div>
              
              <div className="space-y-3">
                {data.traditional_model_reality.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 group/item">
                    <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400 group-hover/item:scale-110 transition-transform" strokeWidth={2.5} />
                    <span className="text-base text-white/70 font-medium leading-relaxed">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
        
        {/* Impact Metrics */}
        <div className="mb-16">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-black text-center mb-10 text-white"
          >
            Impacto <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">medible</span>
          </motion.h3>
          
          <KpiGrid metrics={data.impact_metrics} columns={4} size="lg" />
        </div>
        
        {/* CTAs Estratégicos - NUEVO */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="#s23-propuesta-economica"
            className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 transition-all hover:scale-105 shadow-xl shadow-teal-500/30 border-2 border-teal-400/30"
          >
            <DollarSign className="w-5 h-5" />
            <span>Ir a propuesta económica</span>
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>
          
          <a
            href="#s19-resultados"
            className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white glass-card border-2 border-white/30 hover:bg-white/10 hover:border-white/50 transition-all hover:scale-105"
          >
            <TrendingUp className="w-5 h-5" />
            <span>Ver casos de éxito</span>
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>
        </motion.div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
