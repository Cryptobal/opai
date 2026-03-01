/**
 * ProtocolPDF - PDF component for the full protocol document
 * Uses @react-pdf/renderer (same pattern as PricingPDF)
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ─── Types ────────────────────────────────────────────────

interface ProtocolItem {
  title: string;
  description: string | null;
}

interface ProtocolSection {
  title: string;
  icon: string | null;
  items: ProtocolItem[];
}

export interface ProtocolPDFProps {
  installationName: string;
  version: number | null;
  publishedAt: string | null;
  sections: ProtocolSection[];
}

// ─── Colors ───────────────────────────────────────────────

const COLORS = {
  primary: "#1e293b",
  accent: "#3b82f6",
  gray: "#64748b",
  lightGray: "#f1f5f9",
  white: "#ffffff",
  border: "#e2e8f0",
};

// ─── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    padding: 0,
    backgroundColor: COLORS.white,
    fontFamily: "Helvetica",
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 32,
    paddingBottom: 24,
  },
  headerLabel: {
    fontSize: 9,
    color: COLORS.white,
    opacity: 0.7,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 10,
    color: COLORS.white,
    opacity: 0.8,
  },
  headerMeta: {
    flexDirection: "row",
    marginTop: 12,
    gap: 16,
  },
  headerMetaItem: {
    fontSize: 9,
    color: COLORS.white,
    opacity: 0.7,
  },
  body: {
    padding: 32,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.lightGray,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  sectionIcon: {
    fontSize: 12,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  sectionNumber: {
    fontSize: 10,
    color: COLORS.gray,
    marginRight: 6,
  },
  itemContainer: {
    paddingLeft: 16,
    paddingVertical: 6,
    borderLeft: `2 solid ${COLORS.border}`,
    marginLeft: 8,
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 2,
  },
  itemDescription: {
    fontSize: 9,
    color: COLORS.gray,
    lineHeight: 1.5,
  },
  emptyNote: {
    fontSize: 9,
    color: COLORS.gray,
    fontStyle: "italic",
    paddingLeft: 16,
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: `1 solid ${COLORS.border}`,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: COLORS.gray,
  },
});

// ─── Component ────────────────────────────────────────────

export function ProtocolPDF({
  installationName,
  version,
  publishedAt,
  sections,
}: ProtocolPDFProps) {
  const dateStr = publishedAt
    ? new Date(publishedAt).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>Protocolo de Seguridad</Text>
          <Text style={styles.headerTitle}>{installationName}</Text>
          <View style={styles.headerMeta}>
            {version && (
              <Text style={styles.headerMetaItem}>
                Version {version}
              </Text>
            )}
            <Text style={styles.headerMetaItem}>{dateStr}</Text>
          </View>
          <Text style={[styles.headerSubtitle, { marginTop: 8 }]}>
            Gard Security
          </Text>
        </View>

        <View style={styles.body}>
          {sections.map((section, sIdx) => (
            <View key={sIdx} style={styles.sectionContainer} wrap={false}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionNumber}>{sIdx + 1}.</Text>
                {section.icon && (
                  <Text style={styles.sectionIcon}>{section.icon}</Text>
                )}
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>

              {section.items.length === 0 ? (
                <Text style={styles.emptyNote}>Sin items definidos</Text>
              ) : (
                section.items.map((item, iIdx) => (
                  <View key={iIdx} style={styles.itemContainer}>
                    <Text style={styles.itemTitle}>
                      {sIdx + 1}.{iIdx + 1} {item.title}
                    </Text>
                    {item.description && (
                      <Text style={styles.itemDescription}>
                        {item.description}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Gard Security · Documento confidencial
          </Text>
          <Text style={styles.footerText}>
            {installationName}
            {version ? ` · v${version}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
