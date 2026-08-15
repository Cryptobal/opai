/**
 * Tema institucional para propuestas técnicas y económicas.
 *
 * La cotización conserva su tema propio. Estos tokens se comparten únicamente
 * entre los renderers de propuesta comercial y licitación.
 */

import { pdfColors, pdfFonts, pdfSpacing } from '@/lib/pdf/core/theme';

export const proposalColors = {
  ...pdfColors,
  navy: '#0b1426',
  navyLight: '#16233a',
  navyMuted: '#243754',
  accent: '#e94560',
  accentLight: '#f36b82',
  accentSoft: '#fff0f3',
  paper: '#ffffff',
  canvas: '#f7f9fc',
  tableHeader: '#142033',
  tableRowAlt: '#f4f7fa',
  border: '#dce4ec',
  text: '#223047',
  textMuted: '#607086',
  textSubtle: '#8794a6',
  success: '#16856f',
  successSoft: '#eaf7f4',
  danger: '#c73e55',
} as const;

export const proposalFonts = pdfFonts;

export const proposalSpacing = {
  ...pdfSpacing,
  pageMarginTop: 58,
  pageMarginBottom: 52,
  pageMarginX: 44,
  sectionGap: 16,
} as const;
