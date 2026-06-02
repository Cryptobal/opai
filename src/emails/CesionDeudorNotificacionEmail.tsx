/**
 * Aviso al DEUDOR (receptor de la factura) de que el crédito documentado en
 * un DTE fue cedido a una empresa de factoring (Ley 19.983). Le informa que,
 * en adelante, el pago debe efectuarse al cesionario.
 *
 * Distinto del aviso al cesionario (CesionNotificacionEmail): el destinatario
 * es el cliente que debe pagar, no el factoring.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Hr,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

export interface CesionDeudorNotificacionEmailProps {
  /** Razón social del deudor (receptor del DTE). */
  deudorRazonSocial?: string;
  /** Código de la operación ej. "CES-20260508-0001". */
  operationCode: string;
  /** Monto cedido formateado ej. "$12.500.000". */
  montoCesion: string;
  /** Fecha de cesión ej. "08/05/2026". */
  fechaCesion: string;
  /** Fecha de vencimiento ej. "07/06/2026". */
  fechaVencimiento: string;
  /** Tipo y folio del DTE cedido ej. "Factura tipo 33 / Folio 1630". */
  dteDescripcion: string;
  /** Razón social del cedente (quien emitió la factura). */
  cedenteRazonSocial: string;
  /** Razón social del cesionario (factoring) a quien ahora se paga. */
  cesionarioRazonSocial: string;
  /** Branding del cedente. */
  brandName?: string;
  logoUrl?: string;
  emailContacto?: string;
}

export const CesionDeudorNotificacionEmail = ({
  deudorRazonSocial,
  operationCode = "CES-",
  montoCesion = "$0",
  fechaCesion = "-",
  fechaVencimiento = "-",
  dteDescripcion = "-",
  cedenteRazonSocial = "Cedente",
  cesionarioRazonSocial = "Empresa de Factoring",
  brandName = "OPAI",
  logoUrl = "",
  emailContacto = "",
}: CesionDeudorNotificacionEmailProps) => {
  const previewText = `Aviso de cesión de ${dteDescripcion} — el pago ahora se efectúa a ${cesionarioRazonSocial}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            {logoUrl ? (
              <Img src={logoUrl} width="160" alt={brandName} style={logo} />
            ) : (
              <Text style={brandText}>{brandName}</Text>
            )}
          </Section>

          {/* Título */}
          <Section style={content}>
            <Heading style={h1}>Aviso de cesión de factura</Heading>
            <Text style={greeting}>
              Estimados{deudorRazonSocial ? ` — ${deudorRazonSocial}` : ""}
            </Text>
            <Text style={body}>
              Le informamos que el crédito documentado en la{" "}
              <strong>{dteDescripcion}</strong>, emitida por{" "}
              <strong>{cedenteRazonSocial}</strong>, ha sido{" "}
              <strong>cedido</strong> a{" "}
              <strong>{cesionarioRazonSocial}</strong> conforme a la Ley N° 19.983.
            </Text>

            <Section style={noticeBox}>
              <Text style={noticeText}>
                A partir de esta notificación, el pago de esta factura debe
                efectuarse a <strong>{cesionarioRazonSocial}</strong>, nuevo
                titular del crédito.
              </Text>
            </Section>

            {/* Tabla de datos */}
            <Section style={dataBox}>
              <DataRow label="Documento cedido" value={dteDescripcion} />
              <DataRow label="Emisor (cedente)" value={cedenteRazonSocial} />
              <DataRow label="Cesionario" value={cesionarioRazonSocial} bold />
              <DataRow label="Monto cedido" value={montoCesion} bold />
              <DataRow label="Fecha de cesión" value={fechaCesion} />
              <DataRow label="Fecha de vencimiento" value={fechaVencimiento} />
              <DataRow label="Operación" value={operationCode} mono />
            </Section>

            <Text style={body}>
              La cesión fue registrada electrónicamente en el Registro Público
              de Transferencia de Crédito (RPETC) del SII. Si tiene dudas sobre
              esta operación, comuníquese con el emisor de la factura.
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Este es un correo automático generado por {brandName}. Si tiene
              dudas, comuníquese con{" "}
              {emailContacto ? (
                <a href={`mailto:${emailContacto}`} style={link}>
                  {emailContacto}
                </a>
              ) : (
                "el equipo de finanzas del emisor"
              )}
              .
            </Text>
            <Text style={footerText}>
              © {new Date().getFullYear()} {brandName}. Todos los derechos
              reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

function DataRow({
  label,
  value,
  bold,
  mono,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
}) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: 6 }}>
      <tbody>
        <tr>
          <td style={{ width: "42%", paddingRight: 8, color: "#64748b", fontSize: 13 }}>
            {label}
          </td>
          <td
            style={{
              fontSize: 13,
              color: "#0f172a",
              fontWeight: bold ? 700 : 400,
              fontFamily: mono ? "monospace" : "inherit",
            }}
          >
            {value}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default CesionDeudorNotificacionEmail;

// ── Estilos ───────────────────────────────────────────────
const main: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};
const container: React.CSSProperties = {
  maxWidth: 600,
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #e2e8f0",
};
const header: React.CSSProperties = {
  backgroundColor: "#0d9488",
  padding: "24px 32px",
  textAlign: "center",
};
const logo: React.CSSProperties = { display: "block", margin: "0 auto" };
const brandText: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 22,
  fontWeight: 700,
  margin: 0,
};
const content: React.CSSProperties = { padding: "28px 32px" };
const h1: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#0f172a",
  margin: "0 0 12px",
};
const greeting: React.CSSProperties = {
  fontSize: 14,
  color: "#334155",
  margin: "0 0 12px",
};
const body: React.CSSProperties = {
  fontSize: 14,
  color: "#334155",
  lineHeight: 1.6,
  margin: "0 0 16px",
};
const noticeBox: React.CSSProperties = {
  backgroundColor: "#fef9c3",
  borderRadius: 8,
  padding: "12px 16px",
  border: "1px solid #fde047",
  margin: "0 0 20px",
};
const noticeText: React.CSSProperties = {
  fontSize: 14,
  color: "#713f12",
  lineHeight: 1.5,
  margin: 0,
};
const dataBox: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  borderRadius: 8,
  padding: "16px 20px",
  border: "1px solid #e2e8f0",
  margin: "0 0 20px",
};
const divider: React.CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  margin: "0 32px",
};
const footer: React.CSSProperties = { padding: "16px 32px 24px" };
const footerText: React.CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  margin: "0 0 4px",
};
const link: React.CSSProperties = { color: "#0d9488" };
