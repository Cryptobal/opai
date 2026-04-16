'use client';
/**
 * @deprecated DESDE: 2026-04-16
 *
 * Este módulo forma parte del Sistema de Presentación Comercial de 29 secciones,
 * que NO se muestra al cliente final. El flujo activo de envío al cliente usa
 * el Portal del Cliente (ver `sendQuoteToPortal()` en
 * `src/modules/cpq/send/send-quote-to-portal.ts`).
 *
 * NO USAR EN CÓDIGO NUEVO. Este archivo será eliminado después de
 * 2026-06-15 una vez confirmada estabilidad.
 *
 * Ver: src/lib/_deprecated/README.md
 */


/**
 * Section01b - Sobre [empresa]
 * Muestra qué hace la empresa (company_description del lead/account).
 * Va entre Hero y Resumen Ejecutivo.
 */

import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';

interface Section01bProps {
  companyName: string;
  companyDescription: string;
  showTokens?: boolean;
}

export function Section01bSobreEmpresa({
  companyName,
  companyDescription,
  showTokens = false,
}: Section01bProps) {
  if (!companyDescription?.trim()) return null;

  return (
    <SectionWrapper id="s01b-sobre-empresa" className="section-darker py-12">
      <ContainerWrapper size="xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-card rounded-2xl p-6 md:p-8 border-2 border-teal-400/20 max-w-4xl mx-auto"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500/30 to-blue-500/30 flex items-center justify-center flex-shrink-0 border border-teal-400/30">
              <Building2 className="w-6 h-6 text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-white mb-2">
                Sobre {showTokens ? '[ACCOUNT_NAME]' : companyName}
              </h3>
              <p className="text-base text-white/90 leading-relaxed whitespace-pre-line">
                {companyDescription}
              </p>
            </div>
          </div>
        </motion.div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
