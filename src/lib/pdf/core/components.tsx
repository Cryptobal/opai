/**
 * Reusable @react-pdf/renderer components for PDF documents
 * Navy/Teal branded design system
 */

import { View, Text, Image, Svg, Path, StyleSheet } from '@react-pdf/renderer';
import { pdfColors, pdfFonts, pdfSpacing } from './theme';

const s = StyleSheet.create({
  headerBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: pdfColors.navy,
    padding: pdfSpacing.page,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBrandName: {
    fontFamily: pdfFonts.sans,
    fontWeight: 800,
    fontSize: 20,
    color: pdfColors.white,
    letterSpacing: 2,
  },
  headerBrandSub: {
    fontFamily: pdfFonts.sans,
    fontSize: 8,
    color: pdfColors.slate400,
    marginTop: 2,
  },
  headerCode: {
    fontFamily: pdfFonts.mono,
    fontSize: 11,
    color: pdfColors.teal,
    fontWeight: 500,
  },
  headerLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 8,
    color: pdfColors.slate400,
    marginBottom: 2,
  },
  accentLine: {
    position: 'absolute',
    top: 82,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: pdfColors.teal,
  },
  infoStrip: {
    flexDirection: 'row',
    backgroundColor: pdfColors.slate50,
    borderBottom: `1 solid ${pdfColors.slate200}`,
  },
  infoCell: {
    flex: 1,
    padding: 10,
    borderRight: `1 solid ${pdfColors.slate200}`,
  },
  infoCellLast: {
    flex: 1,
    padding: 10,
  },
  infoLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 7,
    color: pdfColors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    fontWeight: 600,
    color: pdfColors.navy,
  },
  sectionTitle: {
    fontFamily: pdfFonts.sans,
    fontSize: 11,
    fontWeight: 700,
    color: pdfColors.navy,
    paddingBottom: 6,
    borderBottom: `1 solid ${pdfColors.slate200}`,
    marginBottom: 8,
    marginTop: pdfSpacing.section,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: pdfColors.slate100,
    borderBottom: `1.5 solid ${pdfColors.teal}`,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    fontFamily: pdfFonts.sans,
    fontSize: 7,
    fontWeight: 700,
    color: pdfColors.navyLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottom: `0.5 solid ${pdfColors.slate200}`,
  },
  tableCell: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    color: pdfColors.slate700,
  },
  tableCellBold: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    fontWeight: 600,
    color: pdfColors.navy,
  },
  grandTotalRow: {
    flexDirection: 'row',
    backgroundColor: pdfColors.navy,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
    borderRadius: 4,
  },
  grandTotalLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 11,
    fontWeight: 700,
    color: pdfColors.white,
    flex: 1,
  },
  grandTotalAmount: {
    fontFamily: pdfFonts.mono,
    fontSize: 13,
    fontWeight: 700,
    color: pdfColors.teal,
  },
  conditionCard: {
    backgroundColor: pdfColors.white,
    borderLeft: `3 solid ${pdfColors.teal}`,
    padding: 10,
    marginBottom: 8,
    borderRadius: 2,
  },
  conditionLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 7,
    color: pdfColors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  conditionValue: {
    fontFamily: pdfFonts.sans,
    fontSize: 10,
    fontWeight: 600,
    color: pdfColors.navy,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: pdfSpacing.page,
    right: pdfSpacing.page,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5 solid ${pdfColors.slate200}`,
    paddingTop: 8,
  },
  footerText: {
    fontFamily: pdfFonts.sans,
    fontSize: 7,
    color: pdfColors.slate400,
  },
  signatureArea: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 40,
  },
  signatureBlock: {
    flex: 1,
    alignItems: 'center',
  },
  signatureLine: {
    width: '80%',
    borderBottom: `1 solid ${pdfColors.slate700}`,
    marginBottom: 6,
    marginTop: 40,
  },
  signatureName: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    fontWeight: 600,
    color: pdfColors.navy,
  },
  signatureRole: {
    fontFamily: pdfFonts.sans,
    fontSize: 7,
    color: pdfColors.slate500,
    marginTop: 2,
  },
  contactBanner: {
    backgroundColor: pdfColors.teal,
    padding: 14,
    borderRadius: 4,
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  contactItem: {
    alignItems: 'center',
  },
  contactLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 7,
    color: pdfColors.tealLight,
    marginBottom: 2,
  },
  contactValue: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    fontWeight: 600,
    color: pdfColors.white,
  },
});

/* ─── Shield Icon (simple SVG) ─── */
export function ShieldIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
        fill={pdfColors.teal}
      />
      <Path
        d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
        fill={pdfColors.white}
      />
    </Svg>
  );
}

/* ─── Header Band ─── */
export function PDFHeader({
  brandName,
  subtitle,
  code,
  logoUrl,
}: {
  brandName: string;
  subtitle?: string;
  code: string;
  logoUrl?: string;
}) {
  return (
    <View style={s.headerBand} fixed>
      <View>
        <View style={s.headerBrandRow}>
          {logoUrl ? (
            <Image src={logoUrl} style={{ height: 32, maxWidth: 160 }} />
          ) : (
            <>
              <ShieldIcon size={28} />
              <Text style={s.headerBrandName}>{brandName}</Text>
            </>
          )}
        </View>
        {subtitle && <Text style={s.headerBrandSub}>{subtitle}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.headerLabel}>COTIZACION</Text>
        <Text style={s.headerCode}>{code}</Text>
      </View>
    </View>
  );
}

/* ─── Accent Line ─── */
export function PDFAccentLine() {
  return <View style={s.accentLine} fixed />;
}

/* ─── Info Strip ─── */
export function PDFInfoStrip({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <View style={s.infoStrip}>
      {items.map((item, i) => (
        <View
          key={i}
          style={i < items.length - 1 ? s.infoCell : s.infoCellLast}
        >
          <Text style={s.infoLabel}>{item.label}</Text>
          <Text style={s.infoValue}>{item.value || '-'}</Text>
        </View>
      ))}
    </View>
  );
}

/* ─── Section Title ─── */
export function PDFSectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

/* ─── Table ─── */
export function PDFTable({
  headers,
  rows,
  subtotalRow,
}: {
  headers: Array<{ label: string; flex: number; align?: 'left' | 'right' | 'center' }>;
  rows: Array<Array<{ value: string; bold?: boolean }>>;
  subtotalRow?: { label: string; value: string };
}) {
  return (
    <View>
      <View style={s.tableHeader}>
        {headers.map((h, i) => (
          <Text
            key={i}
            style={[
              s.tableHeaderCell,
              { flex: h.flex, textAlign: h.align || 'left' },
            ]}
          >
            {h.label}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={s.tableRow}>
          {row.map((cell, ci) => (
            <Text
              key={ci}
              style={[
                cell.bold ? s.tableCellBold : s.tableCell,
                {
                  flex: headers[ci]?.flex || 1,
                  textAlign: headers[ci]?.align || 'left',
                },
              ]}
            >
              {cell.value}
            </Text>
          ))}
        </View>
      ))}
      {subtotalRow && (
        <View style={[s.tableRow, { backgroundColor: pdfColors.slate50 }]}>
          <Text
            style={[
              s.tableCellBold,
              {
                flex: headers.reduce((s, h, i) => (i < headers.length - 1 ? s + h.flex : s), 0),
                textAlign: 'right',
                paddingRight: 8,
              },
            ]}
          >
            {subtotalRow.label}
          </Text>
          <Text
            style={[
              s.tableCellBold,
              { flex: headers[headers.length - 1]?.flex || 1, textAlign: 'right' },
            ]}
          >
            {subtotalRow.value}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ─── Grand Total ─── */
export function PDFGrandTotal({
  label,
  amount,
}: {
  label: string;
  amount: string;
}) {
  return (
    <View style={s.grandTotalRow}>
      <Text style={s.grandTotalLabel}>{label}</Text>
      <Text style={s.grandTotalAmount}>{amount}</Text>
    </View>
  );
}

/* ─── Condition Card ─── */
export function PDFConditionCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={s.conditionCard}>
      <Text style={s.conditionLabel}>{label}</Text>
      <Text style={s.conditionValue}>{value}</Text>
    </View>
  );
}

/* ─── Footer ─── */
export function PDFFooter({
  website,
  date,
  pageLabel,
  dynamicPageLabel,
}: {
  website?: string;
  date: string;
  pageLabel?: string;
  dynamicPageLabel?: boolean;
}) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Confidencial · {date}</Text>
      <Text style={s.footerText}>{website || ''}</Text>
      {dynamicPageLabel ? (
        <Text
          style={s.footerText}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber}/${totalPages}`}
        />
      ) : (
        pageLabel && <Text style={s.footerText}>{pageLabel}</Text>
      )}
    </View>
  );
}

/* ─── Signature Area ─── */
export function PDFSignatureArea({
  companyName,
  clientName,
  repLegal,
}: {
  companyName: string;
  clientName: string;
  repLegal?: string;
}) {
  return (
    <View style={s.signatureArea}>
      <View style={s.signatureBlock}>
        <View style={s.signatureLine} />
        <Text style={s.signatureName}>{companyName}</Text>
        {repLegal && <Text style={s.signatureRole}>{repLegal}</Text>}
        <Text style={s.signatureRole}>Representante Legal</Text>
      </View>
      <View style={s.signatureBlock}>
        <View style={s.signatureLine} />
        <Text style={s.signatureName}>{clientName}</Text>
        <Text style={s.signatureRole}>Cliente</Text>
      </View>
    </View>
  );
}

/* ─── Contact Banner ─── */
export function PDFContactBanner({
  email,
  phone,
  website,
}: {
  email: string;
  phone: string;
  website?: string;
}) {
  return (
    <View style={s.contactBanner}>
      <View style={s.contactItem}>
        <Text style={s.contactLabel}>EMAIL</Text>
        <Text style={s.contactValue}>{email}</Text>
      </View>
      <View style={s.contactItem}>
        <Text style={s.contactLabel}>TELEFONO</Text>
        <Text style={s.contactValue}>{phone}</Text>
      </View>
      {website && (
        <View style={s.contactItem}>
          <Text style={s.contactLabel}>WEB</Text>
          <Text style={s.contactValue}>{website}</Text>
        </View>
      )}
    </View>
  );
}
