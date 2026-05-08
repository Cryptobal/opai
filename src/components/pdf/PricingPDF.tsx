/**
 * PDF de propuesta económica (react-pdf) — usado por /api/pdf/generate-pricing.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type PricingPdfInput = {
  clientName?: string;
  quoteNumber?: string;
  quoteDate?: string;
  pricing?: {
    items?: Array<{
      description?: string;
      quantity?: number;
      unit_price?: number;
      subtotal?: number;
    }>;
    subtotal?: number;
    payment_terms?: string;
  };
  contactEmail?: string;
  contactPhone?: string;
  companyName?: string;
  website?: string;
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 12 },
  meta: { marginBottom: 8 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 6 },
  cell: { flex: 1 },
  footer: { marginTop: 24, fontSize: 9, color: "#6b7280" },
});

export function PricingPDF(input: PricingPdfInput) {
  const items = input.pricing?.items ?? [];
  const subtotal = input.pricing?.subtotal ?? 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Propuesta económica</Text>
        <Text style={styles.meta}>Cliente: {input.clientName ?? "—"}</Text>
        <Text style={styles.meta}>Cotización: {input.quoteNumber ?? "—"}</Text>
        <Text style={styles.meta}>Fecha: {input.quoteDate ?? "—"}</Text>
        <View style={{ marginTop: 16 }}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.row} wrap={false}>
              <Text style={[styles.cell, { flex: 3 }]}>{item.description ?? ""}</Text>
              <Text style={styles.cell}>{item.quantity ?? 0}</Text>
              <Text style={styles.cell}>{item.unit_price ?? 0}</Text>
              <Text style={styles.cell}>{item.subtotal ?? 0}</Text>
            </View>
          ))}
        </View>
        <Text style={{ marginTop: 16, fontSize: 12 }}>Total neto mensual referencial: {subtotal}</Text>
        {input.pricing?.payment_terms ? (
          <Text style={styles.footer}>Pago: {input.pricing.payment_terms}</Text>
        ) : null}
        <Text style={styles.footer}>
          {input.companyName ?? "Gard Security"} — {input.website ?? "www.gard.cl"}
        </Text>
      </Page>
    </Document>
  );
}
