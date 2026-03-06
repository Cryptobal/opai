/**
 * PDF Theme — Navy/Teal palette for CPQ quotation documents
 */

export const pdfColors = {
  navy: '#0f172a',
  navyLight: '#1e293b',
  teal: '#14b8a6',
  tealDark: '#0d9488',
  tealLight: '#ccfbf1',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  white: '#ffffff',
} as const;

export const pdfFonts = {
  sans: 'PlusJakartaSans',
  mono: 'JetBrainsMono',
} as const;

export const pdfSpacing = {
  page: 30,
  section: 16,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
} as const;
