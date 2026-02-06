'use client';

/**
 * Section23PropuestaEconomica - Pricing con soporte para tokens literales
 */

import { Section23_PropuestaEconomica } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { formatCurrency, formatUF } from '@/lib/utils';
import { FileText, Calendar, TrendingUp, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { DownloadPricingButtonV3 } from '../DownloadPricingButtonV3';
import { ZohoToken } from '../ZohoToken';

interface Section23PropuestaEconomicaProps {
  data: Section23_PropuestaEconomica;
  showTokens?: boolean;
  clientName?: string;
  quoteNumber?: string;
  quoteDate?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export function Section23PropuestaEconomica({ 
  data, 
  showTokens = false,
  clientName = 'Cliente',
  quoteNumber = 'COT-000',
  quoteDate = new Date().toLocaleDateString('es-CL'),
  contactEmail = 'carlos.irigoyen@gard.cl',
  contactPhone = '+56 98 230 7771'
}: Section23PropuestaEconomicaProps) {
  const theme = useThemeClasses();
  const { pricing } = data;
  
  const formatPrice = (value: number) => {
    // Si showTokens está activo Y el valor es 999999, mostrar token
    if (showTokens && value === 999999) {
      return '[PRECIO]';
    }
    // Usar formatCurrency que detecta automáticamente CLF/UF vs CLP
    return formatCurrency(value, pricing.currency);
  };
  
  return (
    <SectionWrapper id="s23-propuesta-economica" className="animated-gradient">
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', duration: 0.8 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass-card border border-teal-400/30 glow-teal mb-8"
          >
            <Sparkles className="w-5 h-5 text-teal-400" />
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              Propuesta Económica
            </span>
          </motion.div>
          
          <h2 className={cn(
            'text-4xl md:text-6xl lg:text-7xl font-black mb-6',
            'text-white leading-tight'
          )}>
            Inversión{' '}
            <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
              mensual
            </span>
          </h2>
          
          <p className="text-xl md:text-2xl text-white/70 max-w-2xl mx-auto">
            Tarifa todo incluido con transparencia total
          </p>
        </div>
        
        {/* Pricing table (desktop) */}
        <div className="hidden md:block mb-12 max-w-6xl mx-auto">
          <div className="glass-card rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[50%]" />
                <col className="w-[12%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
              </colgroup>
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-6 py-5 text-left font-bold text-white text-base">
                    Descripción
                  </th>
                  <th className="px-4 py-5 text-center font-bold text-white text-base whitespace-nowrap">
                    Cant.
                  </th>
                  <th className="px-4 py-5 text-right font-bold text-white text-base whitespace-nowrap">
                    P. Unitario
                  </th>
                  <th className="px-6 py-5 text-right font-bold text-white text-base">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {pricing.items.map((item, index) => (
                  <motion.tr
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1, duration: 0.5 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-5">
                      {/* Nombre del producto */}
                      {showTokens ? (
                        <div className="mb-2">
                          <ZohoToken token={`product_details[${index}].product_name`} />
                        </div>
                      ) : item.name ? (
                        <div className="font-bold text-white text-base mb-2">{item.name}</div>
                      ) : null}
                      
                      {/* Descripción detallada */}
                      <div className="font-normal text-white/80 text-sm leading-relaxed">
                        {showTokens ? (
                          <ZohoToken token={`product_details[${index}].description`} />
                        ) : (
                          item.description
                        )}
                      </div>
                      
                      {/* Notas adicionales */}
                      {item.notes && !showTokens && (
                        <div className="text-xs mt-1 text-white/50">{item.notes}</div>
                      )}
                      {showTokens && (
                        <div className="mt-2">
                          <ZohoToken token={`product_details[${index}].notes`} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-5 text-center text-white/80 font-medium text-sm">
                      {showTokens ? (
                        <ZohoToken token={`product_details[${index}].quantity`} inline />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="px-4 py-5 text-right text-white/70 font-medium text-sm">
                      {showTokens ? (
                        <ZohoToken token={`product_details[${index}].unit_price`} inline />
                      ) : (
                        formatPrice(item.unit_price)
                      )}
                    </td>
                    <td className="px-6 py-5 text-right font-bold text-white text-base">
                      {showTokens ? (
                        <ZohoToken token={`product_details[${index}].subtotal`} inline />
                      ) : (
                        formatPrice(item.subtotal)
                      )}
                    </td>
                  </motion.tr>
                ))}
                
                {/* Total Neto - SIN IVA */}
                <tr className="bg-gradient-to-r from-teal-500/20 to-blue-500/20 border-t-2 border-teal-400/50">
                  <td colSpan={3} className="px-6 py-8 text-right text-xl font-black text-white">
                    TOTAL NETO MENSUAL
                  </td>
                  <td className="px-6 py-8 text-right">
                    <div className="text-4xl font-black bg-gradient-to-br from-teal-400 to-blue-400 bg-clip-text text-transparent leading-tight">
                      {showTokens ? (
                        <ZohoToken token="quote.Sub_Total" inline />
                      ) : (
                        formatPrice(pricing.subtotal)
                      )}
                    </div>
                    <div className="text-xs text-white/50 mt-2">
                      Valores netos. IVA se factura según ley.
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Cards mobile - CON TOKENS */}
        <div className="md:hidden space-y-4 mb-12">
          {pricing.items.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="glass-card rounded-xl p-5 border border-white/10"
            >
              {/* Nombre del producto */}
              {showTokens ? (
                <div className="mb-2">
                  <ZohoToken token={`product_details[${index}].product_name`} />
                </div>
              ) : item.name ? (
                <div className="font-bold text-white text-base mb-2">{item.name}</div>
              ) : null}
              
              {/* Descripción */}
              <div className="font-normal text-white/80 text-sm mb-3">
                {showTokens ? (
                  <ZohoToken token={`product_details[${index}].description`} />
                ) : (
                  item.description
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-white/50">Cantidad:</span>
                  <span className="ml-2 font-semibold text-white">
                    {showTokens ? (
                      <ZohoToken token={`product_details[${index}].quantity`} inline />
                    ) : (
                      item.quantity
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-white/50">P. Unit:</span>
                  <span className="ml-2 font-semibold text-white">
                    {showTokens ? (
                      <ZohoToken token={`product_details[${index}].unit_price`} inline />
                    ) : (
                      formatPrice(item.unit_price)
                    )}
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 text-right text-xl font-bold text-teal-400">
                {showTokens ? (
                  <ZohoToken token={`product_details[${index}].subtotal`} inline />
                ) : (
                  formatPrice(item.subtotal)
                )}
              </div>
            </motion.div>
          ))}
          
          {/* Total Neto mobile */}
          <div className="glass-card rounded-xl p-6 border-2 border-teal-400/50 glow-teal">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xl font-black text-white">TOTAL NETO MENSUAL</span>
                <span className="text-3xl font-black bg-gradient-to-br from-teal-400 to-blue-400 bg-clip-text text-transparent">
                  {showTokens ? (
                    <ZohoToken token="quote.Sub_Total" inline />
                  ) : (
                    formatPrice(pricing.subtotal)
                  )}
                </span>
              </div>
              <p className="text-xs text-white/50">Valores netos. IVA se factura según ley.</p>
            </div>
          </div>
        </div>
        
        {/* Info adicional */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
          {pricing.payment_terms && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="glass-card rounded-xl p-6 border border-white/10 hover:border-teal-400/30 transition-all group"
            >
              <FileText className="w-10 h-10 mb-4 text-teal-400 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-white mb-2">Forma de Pago</h4>
              <p className="text-sm text-white/70">
                {showTokens ? (
                  <ZohoToken token="template.payment_terms" inline />
                ) : (
                  pricing.payment_terms
                )}
              </p>
            </motion.div>
          )}
          
          {(pricing.billing_frequency || showTokens) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="glass-card rounded-xl p-6 border border-white/10 hover:border-teal-400/30 transition-all group"
            >
              <Calendar className="w-10 h-10 mb-4 text-teal-400 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-white mb-2">Frecuencia</h4>
              <p className="text-sm text-white/70">
                {showTokens ? (
                  <ZohoToken token="template.billing_frequency" inline />
                ) : (
                  `Facturación ${pricing.billing_frequency === 'monthly' ? 'mensual' : pricing.billing_frequency === 'quarterly' ? 'trimestral' : 'anual'}`
                )}
              </p>
            </motion.div>
          )}
          
          {(pricing.adjustment_terms || showTokens) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="glass-card rounded-xl p-6 border border-white/10 hover:border-teal-400/30 transition-all group"
            >
              <TrendingUp className="w-10 h-10 mb-4 text-teal-400 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-white mb-2">Reajuste</h4>
              <p className="text-sm text-white/70">
                {showTokens ? (
                  <ZohoToken token="template.adjustment_terms" inline />
                ) : (
                  pricing.adjustment_terms
                )}
              </p>
            </motion.div>
          )}
        </div>
        
        {/* Notas */}
        {pricing.notes && pricing.notes.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto mb-12"
          >
            <div className="glass-card rounded-xl p-8 border border-white/10">
              <div className="space-y-3">
                {pricing.notes.map((note, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-teal-400" />
                    <span className="text-base text-white/80">
                      {showTokens ? `[NOTE_${index + 1}]` : note}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
        
        {/* CTAs */}
        <div className="text-center space-y-4">
          <p className="text-white/60">¿Preguntas sobre la propuesta?</p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {/* Descarga PDF - Ahora usa Playwright para PDF idéntico */}
            <DownloadPricingButtonV3
              clientName={clientName}
              quoteNumber={quoteNumber}
              pricing={pricing}
              quoteDate={quoteDate}
              contactEmail={contactEmail}
              contactPhone={contactPhone}
            />
            
            {/* Reunión comercial */}
            <a
              href={`mailto:${contactEmail}`}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white glass-card border-2 border-white/30 hover:bg-white/10 hover:border-white/50 shadow-xl transition-all duration-300 hover:scale-105"
            >
              <FileText className="w-5 h-5" />
              Solicitar reunión
            </a>
          </div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
