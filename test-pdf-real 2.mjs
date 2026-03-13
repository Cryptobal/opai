// Test with actual quote ID against the real buildQuotationProps
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// We need to test in the Next.js environment. Let's just test renderToBuffer with the component directly.
const React = require('react');
const { renderToBuffer, Document, Page, View, Text, StyleSheet, Font, Svg, Path } = require('@react-pdf/renderer');
const path = require('path');

// Register fonts
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'PlusJakartaSans',
  fonts: [
    { src: path.join(fontsDir, 'PlusJakartaSans-Regular.ttf'), fontWeight: 400 },
    { src: path.join(fontsDir, 'PlusJakartaSans-Medium.ttf'), fontWeight: 500 },
    { src: path.join(fontsDir, 'PlusJakartaSans-SemiBold.ttf'), fontWeight: 600 },
    { src: path.join(fontsDir, 'PlusJakartaSans-Bold.ttf'), fontWeight: 700 },
    { src: path.join(fontsDir, 'PlusJakartaSans-ExtraBold.ttf'), fontWeight: 800 },
  ],
});
Font.register({
  family: 'JetBrainsMono',
  fonts: [
    { src: path.join(fontsDir, 'JetBrainsMono-Regular.ttf'), fontWeight: 400 },
    { src: path.join(fontsDir, 'JetBrainsMono-Medium.ttf'), fontWeight: 500 },
  ],
});

const e = React.createElement;

// Replicate the exact component tree from QuotationPDF
const pdfColors = {
  navy: '#0f172a', navyLight: '#1e293b', teal: '#14b8a6', tealDark: '#0d9488',
  tealLight: '#ccfbf1', slate50: '#f8fafc', slate100: '#f1f5f9', slate200: '#e2e8f0',
  slate400: '#94a3b8', slate500: '#64748b', slate600: '#475569', slate700: '#334155', white: '#ffffff',
};
const pdfFonts = { sans: 'PlusJakartaSans', mono: 'JetBrainsMono' };

const styles = StyleSheet.create({
  page: { fontFamily: pdfFonts.sans, fontSize: 9, color: pdfColors.slate700, backgroundColor: pdfColors.white, paddingBottom: 50 },
  headerBand: { backgroundColor: pdfColors.navy, padding: 30, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBrandName: { fontFamily: pdfFonts.sans, fontWeight: 800, fontSize: 20, color: pdfColors.white, letterSpacing: 2 },
  headerCode: { fontFamily: pdfFonts.mono, fontSize: 11, color: pdfColors.teal, fontWeight: 500 },
  accentLine: { height: 3, backgroundColor: pdfColors.teal },
  body: { paddingHorizontal: 30 },
  sectionTitle: { fontFamily: pdfFonts.sans, fontSize: 11, fontWeight: 700, color: pdfColors.navy, paddingBottom: 6, borderBottom: '1 solid ' + pdfColors.slate200, marginBottom: 8, marginTop: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: pdfColors.slate100, borderBottom: '1.5 solid ' + pdfColors.teal, paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderCell: { fontFamily: pdfFonts.sans, fontSize: 7, fontWeight: 700, color: pdfColors.navyLight, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottom: '0.5 solid ' + pdfColors.slate200 },
  tableCell: { fontFamily: pdfFonts.sans, fontSize: 9, color: pdfColors.slate700 },
  grandTotal: { flexDirection: 'row', backgroundColor: pdfColors.navy, paddingVertical: 10, paddingHorizontal: 12, marginTop: 4, borderRadius: 4 },
  grandTotalLabel: { fontFamily: pdfFonts.sans, fontSize: 11, fontWeight: 700, color: pdfColors.white, flex: 1 },
  grandTotalAmount: { fontFamily: pdfFonts.mono, fontSize: 13, fontWeight: 700, color: pdfColors.teal },
  footer: { position: 'absolute', bottom: 20, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', borderTop: '0.5 solid ' + pdfColors.slate200, paddingTop: 8 },
  footerText: { fontFamily: pdfFonts.sans, fontSize: 7, color: pdfColors.slate400 },
});

// Build document using React.createElement (like SWC would compile JSX)
const doc = e(Document, null,
  e(Page, { size: 'A4', style: styles.page },
    // Header
    e(View, { style: styles.headerBand },
      e(View, null,
        e(View, { style: styles.headerBrandRow },
          e(Svg, { width: 28, height: 28, viewBox: '0 0 24 24' },
            e(Path, { d: 'M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z', fill: pdfColors.teal })
          ),
          e(Text, { style: styles.headerBrandName }, 'GARD SECURITY')
        )
      ),
      e(View, { style: { alignItems: 'flex-end' } },
        e(Text, { style: styles.headerCode }, 'COT-001')
      )
    ),
    // Accent line
    e(View, { style: styles.accentLine }),
    // Body
    e(View, { style: styles.body },
      e(Text, { style: styles.sectionTitle }, 'Puestos de trabajo · 3 guardia(s)'),
      // Table
      e(View, null,
        e(View, { style: styles.tableHeader },
          e(Text, { style: [styles.tableHeaderCell, { flex: 2.5 }] }, 'Puesto'),
          e(Text, { style: [styles.tableHeaderCell, { flex: 1, textAlign: 'right' }] }, 'Valor')
        ),
        e(View, { style: styles.tableRow },
          e(Text, { style: [styles.tableCell, { flex: 2.5 }] }, 'Guardia Diurno'),
          e(Text, { style: [styles.tableCell, { flex: 1, textAlign: 'right' }] }, '$1.500.000')
        )
      ),
      // Grand total
      e(View, { style: styles.grandTotal },
        e(Text, { style: styles.grandTotalLabel }, 'TOTAL'),
        e(Text, { style: styles.grandTotalAmount }, '$1.500.000')
      )
    ),
    // Footer
    e(View, { style: styles.footer, fixed: true },
      e(Text, { style: styles.footerText }, 'Confidencial'),
      e(Text, { style: styles.footerText }, '1/2')
    )
  )
);

renderToBuffer(doc).then(buf => {
  console.log('SUCCESS:', buf.length, 'bytes');
  require('fs').writeFileSync('test-output.pdf', buf);
  console.log('Written to test-output.pdf');
}).catch(err => {
  console.error('FAIL:', err.message);
  console.error(err.stack);
});
