'use client';

/**
 * PresentationRenderer - Componente orquestador principal
 * Renderiza una presentación completa con las 29 secciones
 * Soporta pdfMode para generar versión optimizada para PDF (sin animaciones, layout slide)
 */

import { PresentationPayload } from '@/types/presentation';
import { ThemeProvider } from './ThemeProvider';
import { PdfModeProvider } from './PdfModeContext';
import { PresentationHeader } from '../layout/PresentationHeader';
import { PresentationFooter } from '../layout/PresentationFooter';
import { StickyCTA } from './StickyCTA';
import { NavigationDots } from './NavigationDots';
import { ScrollProgress } from './ScrollProgress';
import { cn } from '@/lib/utils';

// Import secciones implementadas
import { Section01Hero } from './sections/Section01Hero';
import { Section01bSobreEmpresa } from './sections/Section01bSobreEmpresa';
import { Section02ExecutiveSummary } from './sections/Section02ExecutiveSummary';
import { Section03Transparencia } from './sections/Section03Transparencia';
import { Section04Riesgo } from './sections/Section04Riesgo';
import { Section05FallasModelo } from './sections/Section05FallasModelo';
import { Section06CostoReal } from './sections/Section06CostoReal';
import { Section07SistemaCapas } from './sections/Section07SistemaCapas';
import { Section08CuatroPilares } from './sections/Section08CuatroPilares';
import { Section09ComoOperamos } from './sections/Section09ComoOperamos';
import { Section10Supervision } from './sections/Section10Supervision';
import { Section11Reportabilidad } from './sections/Section11Reportabilidad';
import { Section12Cumplimiento } from './sections/Section12Cumplimiento';
import { Section13Certificaciones } from './sections/Section13Certificaciones';
import { Section14Tecnologia } from './sections/Section14Tecnologia';
import { Section15Seleccion } from './sections/Section15Seleccion';
import { Section16NuestraGente } from './sections/Section16NuestraGente';
import { Section17Continuidad } from './sections/Section17Continuidad';
import { Section18KPIs } from './sections/Section18KPIs';
import { Section19Resultados } from './sections/Section19Resultados';
import { Section20Clientes } from './sections/Section20Clientes';
import { Section21Sectores } from './sections/Section21Sectores';
// Section22TCO eliminada - funcionalidad fusionada con Section06CostoReal
import { Section23PropuestaEconomica } from './sections/Section23PropuestaEconomica';
import { Section24TerminosCondiciones } from './sections/Section24TerminosCondiciones';
import { Section25Comparacion } from './sections/Section25Comparacion';
import { Section26PorqueEligen } from './sections/Section26PorqueEligen';
import { Section27Implementacion } from './sections/Section27Implementacion';
import { Section28Cierre } from './sections/Section28Cierre';
import { PlaceholderSection } from './sections/PlaceholderSection';

// CSS para modo PDF: Portrait A4, cada sección empieza en página nueva,
// contenido fluye naturalmente (sin recortes).
const PDF_MODE_STYLES = `
  @page {
    size: A4 portrait;
    margin: 8mm 10mm;
  }
  html, body {
    margin: 0;
    padding: 0;
  }
  .pdf-mode {
    background: #0f172a;
  }
  
  /* ── Cada sección empieza en página nueva ── */
  .pdf-mode .pdf-slide {
    width: 100%;
    position: relative;
    box-sizing: border-box;
    page-break-before: always;
    break-before: page;
  }
  /* La primera sección NO necesita salto (ya está al inicio) */
  .pdf-mode .pdf-slide:first-of-type {
    page-break-before: auto;
    break-before: auto;
  }
  
  /* ── Evitar cortes dentro de elementos clave ── */
  .pdf-mode .glass-card,
  .pdf-mode table,
  .pdf-mode tr,
  .pdf-mode .grid > *,
  .pdf-mode [class*="rounded-xl"],
  .pdf-mode [class*="rounded-2xl"] {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  /* ── Forzar visibilidad de elementos Framer Motion ──
   * FM aplica inline style="opacity:0; transform:translateY(80px)"
   * a elementos fuera del viewport. Este override los hace visibles.
   */
  .pdf-mode [style] {
    opacity: 1 !important;
    transform: none !important;
  }
  
  /* ── Deshabilitar animaciones CSS ── */
  .pdf-mode * {
    animation: none !important;
    animation-delay: 0s !important;
    transition: none !important;
    transition-delay: 0s !important;
  }
  
  /* ── Ocultar elementos interactivos ── */
  .pdf-mode .pdf-hide {
    display: none !important;
  }
  
  /* ── Optimización visual para PDF ── */
  /* Reducir blur/glows que pesan mucho en PDF */
  .pdf-mode [class*="blur-3xl"] {
    filter: blur(40px) !important;
    opacity: 0.15 !important;
  }
  .pdf-mode [class*="blur-2xl"] {
    filter: blur(20px) !important;
    opacity: 0.15 !important;
  }
  /* Cards: simplificar backdrop-filter que pesa en PDF */
  .pdf-mode .glass-card {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: rgba(255,255,255,0.05) !important;
  }
`;

interface PresentationRendererProps {
  payload: PresentationPayload;
  showTokens?: boolean;
  pdfMode?: boolean;
}

/**
 * Secciones incluidas en el PDF descargable.
 * 
 * Solo las esenciales para mantener el PDF liviano y dentro del timeout de 60s:
 * - Portada y contexto del cliente
 * - Resumen ejecutivo
 * - Modelo operativo
 * - Propuesta económica con detalle del servicio
 * - Términos y condiciones
 * - Plan de implementación
 * - Cierre y contacto
 * 
 * Las secciones de marketing (riesgo, transparencia, capas, pilares, etc.)
 * se ven en la web pero no se incluyen en el PDF para optimizar tiempos.
 */

export function PresentationRenderer({ payload, showTokens = false, pdfMode = false }: PresentationRendererProps) {
  const { theme, sections, assets, cta, contact } = payload;
  
  return (
    <PdfModeProvider value={pdfMode}>
      <ThemeProvider variant={theme}>
        {/* Estilos PDF inyectados cuando pdfMode=true */}
        {pdfMode && (
          <style dangerouslySetInnerHTML={{ __html: PDF_MODE_STYLES }} />
        )}
        
        <div className={cn('presentation-container min-h-screen', pdfMode && 'pdf-mode')}>
        {/* Progress Bar Superior - oculto en PDF */}
        {!pdfMode && <ScrollProgress />}
        
        {/* Header persistente - oculto en PDF */}
        {!pdfMode && (
          <PresentationHeader 
            logo={assets.logo}
            clientLogoUrl={payload.client.company_logo_url}
            cta={cta}
            contactName={`${payload.client.contact_first_name || ''} ${payload.client.contact_last_name || ''}`.trim() || payload.client.contact_name}
            companyName={payload.client.company_name}
            quoteName={payload.quote.subject || ''}
            quoteNumber={payload.quote.number}
            showTokens={showTokens}
          />
        )}
        
        {/* Secciones S01-S29 */}
        <main>
          {/* S01 - Hero */}
          <Section01Hero 
            data={sections.s01_hero} 
            payload={payload}
            showTokens={showTokens}
          />
          
          {/* S01b - Sobre [empresa] (entre Hero y Resumen) */}
          <Section01bSobreEmpresa
            companyName={payload.client.company_name}
            companyDescription={payload.client.company_description || ''}
            showTokens={showTokens}
          />
          
          {/* S02 - Resumen Ejecutivo (texto IA del cotizador) */}
          <Section02ExecutiveSummary
            data={sections.s02_executive_summary}
            quoteDescription={payload.quote.description}
            companyName={payload.client.company_name}
            industry={payload.client.industry}
            sitesCount={payload.service.sites.length}
            coverageHours={payload.service.coverage_hours}
            showTokens={showTokens}
          />
          
          {/* ── Secciones de marketing/educativas (solo web, omitidas en PDF) ── */}
          {!pdfMode && (
            <>
              {/* S03 - Transparencia */}
              <Section03Transparencia data={sections.s03_transparencia} />
              
              {/* S04 - El Riesgo Real */}
              <Section04Riesgo data={sections.s04_riesgo} />
              
              {/* S05 - Fallas del Modelo Tradicional */}
              <Section05FallasModelo data={sections.s05_fallas_modelo} />
              
              {/* S06 - Costo Real */}
              <Section06CostoReal data={sections.s06_costo_real} />
              
              {/* S07 - Sistema de Capas */}
              <Section07SistemaCapas data={sections.s07_sistema_capas} />
              
              {/* S08 - 4 Pilares */}
              <Section08CuatroPilares data={sections.s08_4_pilares} />
            </>
          )}
          
          {/* S09 - Cómo Operamos (incluido en PDF: términos operativos) */}
          <Section09ComoOperamos data={sections.s09_como_operamos} />
          
          {/* ── Secciones de credenciales y equipo (solo web) ── */}
          {!pdfMode && (
            <>
              {/* S10 - Supervisión */}
              <Section10Supervision data={sections.s10_supervision} />
              
              {/* S11 - Reportabilidad */}
              <Section11Reportabilidad data={sections.s11_reportabilidad} />
              
              {/* S12 - Cumplimiento */}
              <Section12Cumplimiento data={sections.s12_cumplimiento} />
              
              {/* S13 - Certificaciones */}
              <Section13Certificaciones data={sections.s13_certificaciones} />
              
              {/* S14 - Tecnología */}
              <Section14Tecnologia data={sections.s14_tecnologia} />
              
              {/* S15 - Selección de Personal */}
              <Section15Seleccion data={sections.s15_seleccion} />
              
              {/* S16 - Nuestra Gente */}
              <Section16NuestraGente data={sections.s16_nuestra_gente} />
              
              {/* S17 - Continuidad */}
              <Section17Continuidad data={sections.s17_continuidad} />
              
              {/* S18 - KPIs */}
              <Section18KPIs data={sections.s18_kpis} />
              
              {/* S19 - Resultados */}
              <Section19Resultados data={sections.s19_resultados} />
              
              {/* S20 - Clientes */}
              <Section20Clientes data={sections.s20_clientes} />
              
              {/* S21 - Sectores */}
              <Section21Sectores data={sections.s21_sectores} />
            </>
          )}
          
          {/* S22 - TCO - ELIMINADA: Funcionalidad fusionada con S06 (Costo Real) */}
          
          {/* S23 - Propuesta Económica (incluido en PDF: detalle del servicio y precios) */}
          <Section23PropuestaEconomica 
            data={sections.s23_propuesta_economica} 
            showTokens={showTokens}
            clientName={payload.client.company_name}
            quoteNumber={payload.quote.number}
            quoteDate={payload.quote.date}
            contactEmail="comercial@gard.cl"
            contactPhone="+56 9 8230 7771"
          />
          
          {/* S24 - Términos y Condiciones (incluido en PDF) */}
          <Section24TerminosCondiciones data={sections.s24_terminos_condiciones} />
          
          {/* ── Secciones de comparación (solo web) ── */}
          {!pdfMode && (
            <>
              {/* S25 - Comparación Competitiva */}
              <Section25Comparacion data={sections.s25_comparacion} />
              
              {/* S26 - Por Qué Nos Eligen */}
              <Section26PorqueEligen data={sections.s26_porque_eligen} />
            </>
          )}
          
          {/* S27 - Implementación (incluido en PDF) */}
          <Section27Implementacion data={sections.s27_implementacion} />
          
          {/* S28 - Cierre + CTA (incluido en PDF: contacto) */}
          <Section28Cierre 
            data={sections.s28_cierre}
            contactEmail="comercial@gard.cl"
            contactPhone="+56 9 8230 7771"
          />
          
          {/* S29 - Contacto ELIMINADO (redundante con Footer) */}
        </main>
        
        {/* Footer - oculto en PDF */}
        {!pdfMode && (
          <PresentationFooter 
            logo={assets.logo}
            contact={{
              name: 'Equipo Comercial',
              email: 'comercial@gard.cl',
              phone: '+56 9 8230 7771',
              position: 'Gerente Comercial'
            }}
            address={sections.s29_contacto.address}
            website={sections.s29_contacto.website}
            social_media={sections.s29_contacto.social_media}
          />
        )}
        
        {/* CTA Sticky (Mobile) - oculto en PDF */}
        {!pdfMode && <StickyCTA cta={cta} />}
        
        {/* Índice de Navegación Lateral - oculto en PDF */}
        {!pdfMode && <NavigationDots />}
      </div>
      </ThemeProvider>
    </PdfModeProvider>
  );
}
