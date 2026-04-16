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
 * PdfModeContext - Contexto para modo PDF
 * Permite que SectionWrapper y otros componentes detecten si están en modo PDF
 */

import { createContext, useContext } from 'react';

const PdfModeContext = createContext(false);

export const PdfModeProvider = PdfModeContext.Provider;
export const usePdfMode = () => useContext(PdfModeContext);
