/**
 * PDF Theme — Propuesta Técnica (extiende theme base)
 * Colores navy/teal/accent para documento de propuesta técnica
 */

import { pdfColors, pdfFonts, pdfSpacing } from '@/lib/pdf/core/theme';

export const proposalColors = {
  ...pdfColors,
  accent: '#e94560',
  accentLight: '#ff6b81',
  tableRowAlt: '#f8fafc',
  success: '#22c55e',
  danger: '#ef4444',
} as const;

export const proposalFonts = pdfFonts;

export const proposalSpacing = {
  ...pdfSpacing,
  pageMarginTop: 60,
  pageMarginBottom: 50,
  pageMarginX: 40,
  sectionGap: 15,
} as const;
