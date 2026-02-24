'use client';

/**
 * Section23PropuestaEconomica - Pricing con soporte para tokens literales
 */

import { Section23_PropuestaEconomica } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { usePdfMode } from '../PdfModeContext';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
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
  dealName?: string;
  installationName?: string;
}

export function Section23PropuestaEconomica({
  data,
  showTokens = false,
  clientName = 'Cliente',
  quoteNumber = 'COT-000',
  quoteDate = new Date().toLocaleDateString('es-CL'),
  contactEmail = 'comercial@gard.cl',
  contactPhone = '+56 98 230 7771',
  dealName = '',
  installationName = '',
}: Section23PropuestaEconomicaProps) {
  const theme = useThemeClasses();
  const pdfMode = usePdfMode();
  const { pricing, serviceDetail } = data;
  
  const formatPrice = (value: number) => {
    if (showTokens && value === 999999) return '[PRECIO]';
    return formatCurrency(value, pricing.currency, { ufSuffix: true });
  };
  
  /* ── Context box: Negocio + Instalación ── */
  const contextBlock = !showTokens && (dealName || installationName) ? (
    <div className={cn("max-w-4xl mx-auto", pdfMode ? "mb-8" : "mb-10")}>
      <div className="glass-card rounded-xl px-6 py-4 border border-teal-400/20 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-sm">
        {dealName && (
          <span className="flex items-center gap-2">
            <span className="text-white/50">Negocio:</span>
            <span className="font-bold text-teal-400">{dealName}</span>
          </span>
        )}
        {dealName && installationName && <span className="hidden sm:inline text-white/30">·</span>}
        {installationName && (
          <span className="flex items-center gap-2">
            <span className="text-white/50">Instalacion:</span>
            <span className="font-bold text-teal-400">{installationName}</span>
          </span>
        )}
      </div>
    </div>
  ) : null;

  /* ── Pricing table (shared between PDF and web) ── */
  const pricingHeader = (
    <div className={cn("text-center", pdfMode ? "mb-10" : "mb-16")}>
      <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass-card border border-teal-400/30 glow-teal mb-8">
        <Sparkles className="w-5 h-5 text-teal-400" />
        <span className="text-sm font-bold text-white uppercase tracking-wider">
          Propuesta Económica
        </span>
      </div>
      <h2 className={cn(
        'font-black mb-6 text-white leading-tight',
        pdfMode ? 'text-4xl' : 'text-4xl md:text-6xl lg:text-7xl'
      )}>
        Inversión{' '}
        <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
          mensual
        </span>
      </h2>
      <p className={cn("text-white/70 max-w-2xl mx-auto", pdfMode ? "text-lg" : "text-xl md:text-2xl")}>
        Tarifa todo incluido con transparencia total
      </p>
    </div>
  );

  const pricingTable = (
    <div className={cn("max-w-6xl mx-auto", pdfMode ? "mb-8" : "mb-12")}>
      <div className="glass-card rounded-2xl overflow-hidden overflow-x-auto border-2 border-white/10 shadow-2xl">
        <table className="w-full table-fixed min-w-[480px]">
          <colgroup>
            <col className="w-[50%]" />
            <col className="w-[12%]" />
            <col className="w-[19%]" />
            <col className="w-[19%]" />
          </colgroup>
          <thead>
            <tr className="bg-white/5 border-b border-white/10">
              <th className="px-6 py-5 text-left font-bold text-white text-base">Descripción</th>
              <th className="px-4 py-5 text-center font-bold text-white text-base whitespace-nowrap">Cant.</th>
              <th className="px-4 py-5 text-right font-bold text-white text-base whitespace-nowrap">P. Unitario</th>
              <th className="px-6 py-5 text-right font-bold text-white text-base">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {pricing.items.map((item, index) => (
              <tr key={index} className="border-b border-white/5">
                <td className="px-6 py-5">
                  {showTokens ? (
                    <div className="mb-2"><ZohoToken token={`product_details[${index}].product_name`} /></div>
                  ) : item.name ? (
                    <div className="font-bold text-white text-base mb-2">{item.name}</div>
                  ) : null}
                  <div className="font-normal text-white/80 text-sm leading-relaxed">
                    {showTokens ? <ZohoToken token={`product_details[${index}].description`} /> : item.description}
                  </div>
                  {item.notes && !showTokens && <div className="text-xs sm:text-sm mt-1 text-white/50">{item.notes}</div>}
                </td>
                <td className="px-4 py-5 text-center text-white/80 font-medium text-sm">
                  {showTokens ? <ZohoToken token={`product_details[${index}].quantity`} inline /> : item.quantity}
                </td>
                <td className="px-4 py-5 text-right text-white/70 font-medium text-sm">
                  {showTokens ? <ZohoToken token={`product_details[${index}].unit_price`} inline /> : formatPrice(item.unit_price)}
                </td>
                <td className="px-6 py-5 text-right font-bold text-white text-base">
                  {showTokens ? <ZohoToken token={`product_details[${index}].subtotal`} inline /> : formatPrice(item.subtotal)}
                </td>
              </tr>
            ))}
            <tr className="bg-gradient-to-r from-teal-500/20 to-blue-500/20 border-t-2 border-teal-400/50">
              <td colSpan={3} className="px-6 py-8 text-right text-xl font-black text-white">TOTAL NETO MENSUAL</td>
              <td className="px-6 py-8 text-right">
                <div className="text-4xl font-black bg-gradient-to-br from-teal-400 to-blue-400 bg-clip-text text-transparent leading-tight">
                  {showTokens ? <ZohoToken token="quote.Sub_Total" inline /> : formatPrice(pricing.subtotal)}
                </div>
                <div className="text-xs sm:text-sm text-white/50 mt-2">Valores netos. IVA se factura según ley.</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const serviceDetailBlock = serviceDetail ? (
    <div className="max-w-3xl mx-auto mb-8">
      <div className="glass-card rounded-xl p-8 border border-teal-400/20">
        <h4 className="font-bold text-white text-lg mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-teal-400" />
          Detalle del servicio
        </h4>
        <div className="text-base text-white/80 leading-relaxed whitespace-pre-line">{serviceDetail}</div>
      </div>
    </div>
  ) : null;

  const paymentCards = (
    <div className={cn("grid gap-6 max-w-5xl mx-auto", pdfMode ? "grid-cols-3 mb-8" : "md:grid-cols-3 mb-12")}>
      {pricing.payment_terms && (
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <FileText className="w-10 h-10 mb-4 text-teal-400" />
          <h4 className="font-bold text-white mb-2">Forma de Pago</h4>
          <p className="text-sm text-white/70">
            {showTokens ? <ZohoToken token="template.payment_terms" inline /> : pricing.payment_terms}
          </p>
        </div>
      )}
      {(pricing.billing_frequency || showTokens) && (
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <Calendar className="w-10 h-10 mb-4 text-teal-400" />
          <h4 className="font-bold text-white mb-2">Frecuencia</h4>
          <p className="text-sm text-white/70">
            {showTokens ? <ZohoToken token="template.billing_frequency" inline /> : `Facturación ${pricing.billing_frequency === 'monthly' ? 'mensual' : pricing.billing_frequency === 'quarterly' ? 'trimestral' : 'anual'}`}
          </p>
        </div>
      )}
      {(pricing.adjustment_terms || showTokens) && (
        <div className="glass-card rounded-xl p-6 border border-white/10">
          <TrendingUp className="w-10 h-10 mb-4 text-teal-400" />
          <h4 className="font-bold text-white mb-2">Reajuste</h4>
          <p className="text-sm text-white/70">
            {showTokens ? <ZohoToken token="template.adjustment_terms" inline /> : pricing.adjustment_terms}
          </p>
        </div>
      )}
    </div>
  );

  const notesBlock = pricing.notes && pricing.notes.length > 0 ? (
    <div className="max-w-3xl mx-auto mb-8">
      <div className="glass-card rounded-xl p-8 border border-white/10">
        <div className="space-y-3">
          {pricing.notes.map((note, index) => (
            <div key={index} className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-teal-400" />
              <span className="text-base text-white/80">{showTokens ? `[NOTE_${index + 1}]` : note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  /* ── PDF MODE: Split into two section-containers ── */
  if (pdfMode) {
    return (
      <>
        {/* Página 1: Inversión mensual + tabla + detalle del servicio */}
        <SectionWrapper id="s23-propuesta-economica" className="animated-gradient">
          <ContainerWrapper size="xl">
            {pricingHeader}
            {contextBlock}
            {pricingTable}
            {serviceDetailBlock}
          </ContainerWrapper>
        </SectionWrapper>

        {/* Página 2: Forma de pago, frecuencia, reajuste y notas */}
        <SectionWrapper id="s23b-condiciones-pago" className="animated-gradient">
          <ContainerWrapper size="xl">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-white mb-4">
                Condiciones{' '}
                <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                  comerciales
                </span>
              </h2>
              <p className="text-lg text-white/70 max-w-2xl mx-auto">
                Forma de pago, frecuencia de facturación y reajuste
              </p>
            </div>
            {paymentCards}
            {notesBlock}
          </ContainerWrapper>
        </SectionWrapper>
      </>
    );
  }

  /* ── WEB MODE: Single section with animations ── */
  return (
    <SectionWrapper id="s23-propuesta-economica" className="animated-gradient">
      <ContainerWrapper size="xl">
        {pricingHeader}
        {contextBlock}

        {/* Desktop table */}
        <div className="hidden md:block">
          {pricingTable}
        </div>
        
        {/* Mobile cards */}
        <div className="md:hidden space-y-4 mb-12">
          {pricing.items.map((item, index) => (
            <motion.div key={index} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }}
              className="glass-card rounded-xl p-5 border border-white/10">
              {showTokens ? <div className="mb-2"><ZohoToken token={`product_details[${index}].product_name`} /></div>
                : item.name ? <div className="font-bold text-white text-base mb-2">{item.name}</div> : null}
              <div className="font-normal text-white/80 text-sm mb-3">
                {showTokens ? <ZohoToken token={`product_details[${index}].description`} /> : item.description}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-white/50">Cantidad:</span><span className="ml-2 font-semibold text-white">{showTokens ? <ZohoToken token={`product_details[${index}].quantity`} inline /> : item.quantity}</span></div>
                <div><span className="text-white/50">P. Unit:</span><span className="ml-2 font-semibold text-white">{showTokens ? <ZohoToken token={`product_details[${index}].unit_price`} inline /> : formatPrice(item.unit_price)}</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 text-right text-xl font-bold text-teal-400">
                {showTokens ? <ZohoToken token={`product_details[${index}].subtotal`} inline /> : formatPrice(item.subtotal)}
              </div>
            </motion.div>
          ))}
          <div className="glass-card rounded-xl p-6 border-2 border-teal-400/50 glow-teal">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xl font-black text-white">TOTAL NETO MENSUAL</span>
              <span className="text-3xl font-black bg-gradient-to-br from-teal-400 to-blue-400 bg-clip-text text-transparent">
                {showTokens ? <ZohoToken token="quote.Sub_Total" inline /> : formatPrice(pricing.subtotal)}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-white/50">Valores netos. IVA se factura según ley.</p>
          </div>
        </div>
        
        {paymentCards}
        {notesBlock}
        {serviceDetailBlock}

        {/* CTAs - ocultos en modo PDF */}
        <div className="text-center space-y-4 pdf-hide">
          <p className="text-white/60">¿Preguntas sobre la propuesta?</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <DownloadPricingButtonV3 clientName={clientName} quoteNumber={quoteNumber} pricing={pricing} quoteDate={quoteDate} contactEmail={contactEmail} contactPhone={contactPhone} />
            <a href="https://calendar.app.google/MfyKXvYxURJSnUBe9" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white glass-card border-2 border-white/30 hover:bg-white/10 hover:border-white/50 shadow-xl transition-all duration-300 hover:scale-105">
              <FileText className="w-5 h-5" />
              Solicitar reunión
            </a>
          </div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
