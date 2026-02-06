'use client';

/**
 * PresentationRenderer - Componente orquestador principal
 * Renderiza una presentación completa con las 29 secciones
 */

import { PresentationPayload } from '@/types/presentation';
import { ThemeProvider } from './ThemeProvider';
import { PresentationHeader } from '../layout/PresentationHeader';
import { PresentationFooter } from '../layout/PresentationFooter';
import { StickyCTA } from './StickyCTA';
import { NavigationDots } from './NavigationDots';
import { ScrollProgress } from './ScrollProgress';

// Import secciones implementadas
import { Section01Hero } from './sections/Section01Hero';
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

interface PresentationRendererProps {
  payload: PresentationPayload;
  showTokens?: boolean;
}

export function PresentationRenderer({ payload, showTokens = false }: PresentationRendererProps) {
  const { theme, sections, assets, cta, contact } = payload;
  
  return (
    <ThemeProvider variant={theme}>
      <div className="presentation-container min-h-screen">
        {/* Progress Bar Superior */}
        <ScrollProgress />
        
        {/* Header persistente */}
        <PresentationHeader 
          logo={assets.logo}
          cta={cta}
          contactName={`${payload.client.contact_first_name || ''} ${payload.client.contact_last_name || ''}`.trim() || payload.client.contact_name} // Nombre + Apellido
          companyName={payload.client.company_name}
          quoteName={payload.quote.subject || ''} // Asunto de la cotización
          quoteNumber={payload.quote.number}
          showTokens={showTokens}
        />
        
        {/* Secciones S01-S29 */}
        <main>
          {/* S01 - Hero */}
          <Section01Hero 
            data={sections.s01_hero} 
            payload={payload}
            showTokens={showTokens}
          />
          
          {/* S02 - Executive Summary */}
          <Section02ExecutiveSummary 
            data={sections.s02_executive_summary}
            quoteDescription={payload.quote.description}
            companyName={payload.client.company_name}
            industry={payload.client.industry}
            sitesCount={payload.service.sites.length}
            coverageHours={payload.service.coverage_hours}
            showTokens={showTokens}
          />
          
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
          
          {/* S09 - Cómo Operamos */}
          <Section09ComoOperamos data={sections.s09_como_operamos} />
          
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
          
          {/* S22 - TCO - ELIMINADA: Funcionalidad fusionada con S06 (Costo Real) */}
          {/* La comparación de costos TCO ahora se muestra en Section06CostoReal con valores en UF y modal interactivo */}
          
          {/* S23 - Propuesta Económica */}
          <Section23PropuestaEconomica 
            data={sections.s23_propuesta_economica} 
            showTokens={showTokens}
            clientName={payload.client.company_name}
            quoteNumber={payload.quote.number}
            quoteDate={payload.quote.date}
            contactEmail={contact.email}
            contactPhone={contact.phone}
          />
          
          {/* S24 - Términos y Condiciones */}
          <Section24TerminosCondiciones data={sections.s24_terminos_condiciones} />
          
          {/* S25 - Comparación Competitiva */}
          <Section25Comparacion data={sections.s25_comparacion} />
          
          {/* S26 - Por Qué Nos Eligen */}
          <Section26PorqueEligen data={sections.s26_porque_eligen} />
          
          {/* S27 - Implementación */}
          <Section27Implementacion data={sections.s27_implementacion} />
          
          {/* S28 - Cierre + CTA */}
          <Section28Cierre 
            data={sections.s28_cierre}
            contactEmail={contact.email}
            contactPhone={contact.phone}
          />
          
          {/* S29 - Contacto ELIMINADO (redundante con Footer) */}
        </main>
        
        {/* Footer */}
        <PresentationFooter 
          logo={assets.logo}
          contact={contact}
          address={sections.s29_contacto.address}
          website={sections.s29_contacto.website}
          social_media={sections.s29_contacto.social_media}
        />
        
        {/* CTA Sticky (Mobile) */}
        <StickyCTA cta={cta} />
        
        {/* Índice de Navegación Lateral */}
        <NavigationDots />
      </div>
    </ThemeProvider>
  );
}
