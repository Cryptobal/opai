/**
 * PricingPDF - Componente para generar PDF de propuesta económica
 * Diseño branded con logo y colores Gard
 * Paginación automática según cantidad de items
 */

import { Document, Page, Text, View, StyleSheet, Image as PDFImage } from '@react-pdf/renderer';
import { PricingData } from '@/types/presentation';

interface PricingPDFProps {
  clientName: string;
  quoteNumber: string;
  quoteDate: string;
  pricing: PricingData;
  contactEmail?: string;
  contactPhone?: string;
}

// Estilos branded de Gard - ACTUALIZADO para match con preview
const styles = StyleSheet.create({
  page: {
    padding: 0,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
  },
  header: {
    backgroundColor: '#14b8a6', // Teal-500
    padding: 32,
    marginBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 120,
    height: 48,
  },
  pageNumber: {
    fontSize: 10,
    color: '#ffffff',
    textAlign: 'right',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  clientInfo: {
    fontSize: 11,
    color: '#ffffff',
    marginBottom: 4,
  },
  clientInfoLabel: {
    fontWeight: 'bold',
  },
  table: {
    marginTop: 0,
    marginBottom: 20,
    marginLeft: 32,
    marginRight: 32,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderBottom: '2 solid #14b8a6',
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottom: '1 solid #e2e8f0',
  },
  tableCell: {
    fontSize: 10,
    color: '#334155',
  },
  tableCellBold: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  totalRow: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#d1fae5',
    border: '2 solid #14b8a6',
    borderRadius: 8,
    marginTop: 16,
    marginLeft: 32,
    marginRight: 32,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#14b8a6',
  },
  note: {
    fontSize: 9,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
  },
  termsSection: {
    marginTop: 20,
    marginLeft: 32,
    marginRight: 32,
    padding: 20,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  termsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  termItem: {
    fontSize: 10,
    color: '#334155',
    marginBottom: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 32,
    right: 32,
    paddingTop: 15,
    borderTop: '1 solid #e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 9,
    color: '#64748b',
  },
});

export function PricingPDF({ 
  clientName, 
  quoteNumber, 
  quoteDate,
  pricing,
  contactEmail = 'carlos.irigoyen@gard.cl',
  contactPhone = '+56 98 230 7771'
}: PricingPDFProps) {
  // Calcular paginación
  const ITEMS_PER_PAGE = 12;
  const totalPages = Math.ceil(pricing.items.length / ITEMS_PER_PAGE);
  
  // Split items en páginas
  const pages: typeof pricing.items[] = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push(pricing.items.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE));
  }
  
  const formatPrice = (value: number) => {
    // Detectar si es UF o CLP basado en el currency del pricing
    const curr = pricing.currency as string;
    if (curr === 'CLF' || curr === 'UF' || curr === 'uf') {
      // Formato UF
      return `UF ${value.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    } else {
      // Formato CLP
      return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
      }).format(value);
    }
  };
  
  return (
    <Document>
      {pages.map((pageItems, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {/* Header con gradiente teal (simulado con color sólido) */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              {/* Logo Gard Blanco */}
              <PDFImage 
                src="/Logo Gard Blanco.png"
                style={styles.logo}
              />
              <Text style={styles.pageNumber}>Página {pageIndex + 1} de {totalPages}</Text>
            </View>
            
            <Text style={styles.title}>PROPUESTA ECONÓMICA</Text>
            <Text style={styles.clientInfo}>
              <Text style={styles.clientInfoLabel}>Para:</Text> {clientName}
            </Text>
            <Text style={styles.clientInfo}>
              <Text style={styles.clientInfoLabel}>Cotización:</Text> {quoteNumber}
            </Text>
            <Text style={styles.clientInfo}>
              <Text style={styles.clientInfoLabel}>Fecha:</Text> {quoteDate}
            </Text>
          </View>
          
          {/* Tabla */}
          <View style={styles.table}>
            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Descripción</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Cant.</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>P. Unit.</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Subtotal</Text>
            </View>
            
            {/* Items */}
            {pageItems.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 3 }]}>{item.description}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>{formatPrice(item.unit_price)}</Text>
                <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right' }]}>{formatPrice(item.subtotal)}</Text>
              </View>
            ))}
          </View>
          
          {/* Total solo en última página */}
          {pageIndex === pages.length - 1 && (
            <>
              {/* Total Neto */}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { flex: 1 }]}>TOTAL NETO MENSUAL</Text>
                <Text style={[styles.totalAmount, { flex: 1, textAlign: 'right' }]}>{formatPrice(pricing.total || pricing.subtotal)}</Text>
              </View>
              
              <Text style={styles.note}>Valores netos. IVA se factura según ley.</Text>
              
              {/* Términos */}
              {(pricing.payment_terms || pricing.adjustment_terms) && (
                <View style={styles.termsSection}>
                  <Text style={styles.termsTitle}>Condiciones Comerciales</Text>
                  {pricing.payment_terms && (
                    <Text style={styles.termItem}>• Forma de pago: {pricing.payment_terms}</Text>
                  )}
                  {pricing.adjustment_terms && (
                    <Text style={styles.termItem}>• Reajuste: {pricing.adjustment_terms}</Text>
                  )}
                  {pricing.notes && pricing.notes.map((note, i) => (
                    <Text key={i} style={styles.termItem}>• {note}</Text>
                  ))}
                </View>
              )}
            </>
          )}
          
          {/* Footer en cada página */}
          <View style={styles.footer} fixed>
            <View>
              <Text style={styles.footerText}>{contactEmail}</Text>
              <Text style={styles.footerText}>{contactPhone}</Text>
            </View>
            <View>
              <Text style={styles.footerText}>Gard Security</Text>
              <Text style={styles.footerText}>www.gard.cl</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}
