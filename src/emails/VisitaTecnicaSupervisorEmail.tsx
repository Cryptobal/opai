/**
 * Email Template: Visita Técnica Programada — Supervisor
 *
 * Notifica al supervisor que se le asignó una visita técnica,
 * incluyendo datos de la instalación, fecha/hora, contacto y puestos.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Row,
  Column,
} from "@react-email/components";
import * as React from "react";

interface PuestoItem {
  name: string;
  cargo: string | null;
  numGuards: number;
  numPuestos: number;
  startTime: string;
  endTime: string;
  weekdays: string[];
}

interface VisitaTecnicaSupervisorEmailProps {
  supervisorName: string;
  installationName: string;
  installationAddress: string | null;
  mapsUrl: string | null;
  scheduledAt: Date;
  contactName: string | null;
  contactPhone: string | null;
  quoteCode: string;
  puestosDetail: PuestoItem[];
  portalUrl: string;
  solicitadoPor: string;
}

const WEEKDAY_LABELS: Record<string, string> = {
  Mon: "Lun", Tue: "Mar", Wed: "Mié", Thu: "Jue",
  Fri: "Vie", Sat: "Sáb", Sun: "Dom",
};

function formatWeekdays(days: string[]): string {
  return days.map((d) => WEEKDAY_LABELS[d] ?? d).join(", ");
}

export const VisitaTecnicaSupervisorEmail = ({
  supervisorName = "Supervisor",
  installationName = "Instalación",
  installationAddress = null,
  mapsUrl = null,
  scheduledAt = new Date(),
  contactName = null,
  contactPhone = null,
  quoteCode = "CPQ-XXXX",
  puestosDetail = [],
  portalUrl = "https://opai.gard.cl/portal/supervisor",
  solicitadoPor = "equipo comercial",
}: VisitaTecnicaSupervisorEmailProps) => {
  const fechaFormateada = scheduledAt.toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Santiago",
  });
  const horaFormateada = scheduledAt.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });

  const previewText = `Visita técnica asignada — ${installationName} · ${fechaFormateada}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>

          {/* Header */}
          <Section style={header}>
            <Img
              src="https://opai.gard.cl/Logo%20Gard%20Blanco.png"
              width="140"
              alt="Gard Security"
              style={logo}
            />
            <Text style={headerTagline}>Portal Supervisor · Visita Técnica</Text>
          </Section>

          {/* Hero */}
          <Section style={hero}>
            <Text style={heroEyebrow}>NUEVA VISITA ASIGNADA</Text>
            <Heading style={h1}>
              Hola {supervisorName},<br />tienes una visita técnica programada
            </Heading>
            <Text style={heroText}>
              Se ha programado una visita técnica para la instalación{" "}
              <strong>{installationName}</strong>. Revisa los detalles a continuación.
            </Text>
          </Section>

          {/* Detalles de la visita */}
          <Section style={detailsCard}>
            <Text style={cardTitle}>📋 Detalle de la visita</Text>
            <Hr style={divider} />

            <Row style={detailRow}>
              <Column style={detailLabel}>📅 Fecha</Column>
              <Column style={detailValue}>{fechaFormateada}</Column>
            </Row>
            <Row style={detailRow}>
              <Column style={detailLabel}>🕐 Hora</Column>
              <Column style={detailValue}>{horaFormateada}</Column>
            </Row>
            <Row style={detailRow}>
              <Column style={detailLabel}>🏢 Instalación</Column>
              <Column style={detailValue}>{installationName}</Column>
            </Row>
            {installationAddress && (
              <Row style={detailRow}>
                <Column style={detailLabel}>📍 Dirección</Column>
                <Column style={detailValue}>
                  {mapsUrl ? (
                    <Link href={mapsUrl} style={mapLink}>
                      {installationAddress}
                    </Link>
                  ) : (
                    installationAddress
                  )}
                </Column>
              </Row>
            )}
            {contactName && (
              <Row style={detailRow}>
                <Column style={detailLabel}>👤 Contacto</Column>
                <Column style={detailValue}>{contactName}</Column>
              </Row>
            )}
            {contactPhone && (
              <Row style={detailRow}>
                <Column style={detailLabel}>📞 Teléfono</Column>
                <Column style={detailValue}>
                  <Link href={`tel:${contactPhone}`} style={mapLink}>
                    {contactPhone}
                  </Link>
                </Column>
              </Row>
            )}
            <Row style={detailRow}>
              <Column style={detailLabel}>📄 Cotización</Column>
              <Column style={detailValue}>{quoteCode}</Column>
            </Row>
          </Section>

          {/* Puestos requeridos */}
          {puestosDetail.length > 0 && (
            <Section style={puestosCard}>
              <Text style={cardTitle}>👮 Puestos para esta visita</Text>
              <Hr style={divider} />
              {puestosDetail.map((p, i) => (
                <Row key={i} style={puestoRow}>
                  <Column>
                    <Text style={puestoName}>
                      {p.name}{p.cargo ? ` — ${p.cargo}` : ""}
                    </Text>
                    <Text style={puestoDetail}>
                      {p.numGuards} guardia{p.numGuards !== 1 ? "s" : ""} ·{" "}
                      {p.startTime}–{p.endTime} · {formatWeekdays(p.weekdays)}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          {/* Mapa CTA */}
          {mapsUrl && (
            <Section style={{ textAlign: "center", padding: "12px 0" }}>
              <Button style={mapButton} href={mapsUrl}>
                📍 Ver en Google Maps
              </Button>
            </Section>
          )}

          {/* Portal CTA */}
          <Section style={{ textAlign: "center", padding: "8px 0 24px" }}>
            <Button style={portalButton} href={portalUrl}>
              Ir a mi portal de supervisor
            </Button>
          </Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>
              Esta visita fue solicitada por <strong>{solicitadoPor}</strong>.
              Si tienes dudas, responde este correo.
            </Text>
            <Text style={footerSmall}>
              Gard Security · OPAI Suite · Portal de Operaciones
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default VisitaTecnicaSupervisorEmail;

// ─── Styles ───────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: "#0f0f13",
  fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
};

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#0f0f13",
};

const header: React.CSSProperties = {
  background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
  padding: "28px 32px 24px",
  textAlign: "center",
};

const logo: React.CSSProperties = {
  display: "block",
  margin: "0 auto 8px",
};

const headerTagline: React.CSSProperties = {
  color: "#a5b4fc",
  fontSize: "11px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  margin: "0",
};

const hero: React.CSSProperties = {
  padding: "32px 32px 24px",
  backgroundColor: "#13131a",
};

const heroEyebrow: React.CSSProperties = {
  color: "#6366f1",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "2px",
  textTransform: "uppercase",
  margin: "0 0 12px",
};

const h1: React.CSSProperties = {
  color: "#f1f5f9",
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 12px",
};

const heroText: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0",
};

const detailsCard: React.CSSProperties = {
  margin: "0 24px 16px",
  padding: "20px 24px",
  backgroundColor: "#1a1a24",
  borderRadius: "12px",
  border: "1px solid #2a2a3a",
};

const puestosCard: React.CSSProperties = {
  margin: "0 24px 16px",
  padding: "20px 24px",
  backgroundColor: "#1a1a24",
  borderRadius: "12px",
  border: "1px solid #2a2a3a",
};

const cardTitle: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: "14px",
  fontWeight: "700",
  margin: "0 0 8px",
};

const divider: React.CSSProperties = {
  borderColor: "#2a2a3a",
  margin: "8px 0 16px",
};

const detailRow: React.CSSProperties = {
  marginBottom: "8px",
};

const detailLabel: React.CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: "600",
  width: "110px",
  verticalAlign: "top",
  paddingRight: "8px",
};

const detailValue: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: "13px",
};

const mapLink: React.CSSProperties = {
  color: "#818cf8",
  textDecoration: "underline",
};

const puestoRow: React.CSSProperties = {
  marginBottom: "10px",
  paddingBottom: "10px",
  borderBottom: "1px solid #2a2a3a",
};

const puestoName: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: "13px",
  fontWeight: "600",
  margin: "0 0 2px",
};

const puestoDetail: React.CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  margin: "0",
};

const mapButton: React.CSSProperties = {
  backgroundColor: "#1d4ed8",
  color: "#ffffff",
  padding: "10px 24px",
  borderRadius: "8px",
  fontSize: "13px",
  fontWeight: "600",
  textDecoration: "none",
  display: "inline-block",
};

const portalButton: React.CSSProperties = {
  backgroundColor: "#6366f1",
  color: "#ffffff",
  padding: "12px 32px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: "700",
  textDecoration: "none",
  display: "inline-block",
};

const footer: React.CSSProperties = {
  padding: "20px 32px 32px",
  textAlign: "center",
};

const footerText: React.CSSProperties = {
  color: "#475569",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0 0 6px",
};

const footerSmall: React.CSSProperties = {
  color: "#334155",
  fontSize: "11px",
  margin: "0",
};
