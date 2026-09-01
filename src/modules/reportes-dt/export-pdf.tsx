// @ds-allow-legacy react-pdf no admite tokens CSS del DS; Arial no está embebida (Helvetica 8).
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DtBuiltReport } from "./portal-reports";
import { DT_SIGLAS_GLOSSARY } from "./constants";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 10, marginBottom: 6 },
  meta: { fontSize: 8, marginBottom: 4 },
  worker: { fontSize: 8, marginTop: 8, marginBottom: 4 },
  table: { width: "100%" },
  row: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#cccccc", paddingVertical: 2 },
  head: { flexDirection: "row", borderBottomWidth: 0.8, paddingVertical: 2 },
  cell: { fontSize: 8, flexGrow: 1, flexBasis: 0, paddingRight: 4 },
  modified: { backgroundColor: "#fff3cd" },
  empty: { fontSize: 8, marginTop: 8 },
  glossary: { fontSize: 7, marginTop: 12 },
});

function ReportPdf({ report }: { report: DtBuiltReport }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.meta}>
          {report.employerName} · {report.employerRut} · {report.from} a {report.to}
        </Text>
        {report.empty ? (
          <Text style={styles.empty}>{report.emptyMessage}</Text>
        ) : (
          report.workers.map((w) => (
            <View key={w.workerId} wrap={false}>
              <Text style={styles.worker}>
                {w.workerName} · {w.workerRut} · {w.installationName} · {w.cargo}
              </Text>
              <View style={styles.head}>
                {report.columns.map((c) => (
                  <Text key={c.key} style={styles.cell}>
                    {c.label}
                  </Text>
                ))}
              </View>
              {w.rows.length === 0 && w.emptyMessage ? (
                <Text style={styles.empty}>{w.emptyMessage}</Text>
              ) : (
                w.rows.map((row, idx) => {
                  const modified = w.modifiedRowIds?.includes(String(row.id ?? ""));
                  return (
                    <View key={String(row.id ?? idx)} style={modified ? [styles.row, styles.modified] : styles.row}>
                      {report.columns.map((c) => (
                        <Text key={c.key} style={styles.cell}>
                          {String(row[c.key] ?? "")}
                        </Text>
                      ))}
                    </View>
                  );
                })
              )}
              {w.weeklyTotals?.map((tot, tIdx) => (
                <Text key={`tot-${tIdx}`} style={styles.meta}>
                  {Object.values(tot).join(" · ")}
                </Text>
              ))}
            </View>
          ))
        )}
        <Text style={styles.glossary}>{DT_SIGLAS_GLOSSARY}</Text>
      </Page>
    </Document>
  );
}

export async function reportToPdfBuffer(report: DtBuiltReport): Promise<Buffer> {
  const buffer = await renderToBuffer(ReportPdf({ report }));
  return Buffer.from(buffer);
}

export async function simpleTablePdfBuffer(
  title: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
  emptyMessage?: string,
): Promise<Buffer> {
  const report: DtBuiltReport = {
    tipo: "tabla",
    title,
    employerName: "",
    employerRut: "",
    from: "",
    to: "",
    empty: rows.length === 0,
    emptyMessage: emptyMessage || "",
    columns,
    workers:
      rows.length === 0
        ? []
        : [
            {
              workerId: "all",
              workerName: "",
              workerRut: "",
              installationName: "",
              cargo: "",
              header: {},
              rows: rows as DtBuiltReport["workers"][0]["rows"],
            },
          ],
    glossary: DT_SIGLAS_GLOSSARY,
  };
  return reportToPdfBuffer(report);
}
