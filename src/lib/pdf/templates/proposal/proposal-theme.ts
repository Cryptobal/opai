/**
 * PDF Theme — Documento único Propuesta Técnica y Económica (mockup v1).
 */
import { pdfColors, pdfFonts, pdfSpacing } from '@/lib/pdf/core/theme';

export const proposalColors = {
  ...pdfColors,
  accent: '#c41e3a',
  accentLight: '#e94560',
  navy: '#142033',
  teal: '#0f766e',
  tableRowAlt: '#f8fafc',
  success: '#22c55e',
  danger: '#ef4444',
  muted: '#64748b',
  line: '#e2e8f0',
} as const;

export const proposalFonts = pdfFonts;

export const proposalSpacing = {
  ...pdfSpacing,
  pageMarginTop: 56,
  pageMarginBottom: 48,
  pageMarginX: 44,
  sectionGap: 14,
} as const;
