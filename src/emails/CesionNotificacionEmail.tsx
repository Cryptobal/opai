/**
 * Email al cesionario (empresa de factoring) avisando que una cesión
 * electrónica fue registrada y enviada al RPETC del SII.
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

export interface CesionNotificacionEmailProps {
  /** Razón social del cesionario (factoring). */
  cesionarioRazonSocial: string;
  /** Nombre del contacto en el factoring (si se conoce). */
  contactoNombre?: string;
  /** Código de la operación ej. "CES-20260508-0001". */
  operationCode: string;
  /** Monto cedido formateado ej. "$12.500.000". */
  montoCesion: string;
  /** Fecha de cesión ej. "08/05/2026". */
  fechaCesion: string;
  /** Fecha de vencimiento ej. "07/06/2026". */
  fechaVencimiento: string;
  /** Tipo y folio del DTE cedido ej. "Factura 33 / Folio 1630". */
  dteDescripcion: string;
  /** RUT del emisor/cedente. */
  cedenteRazonSocial: string;
  /** TrackId RPETC o referencia del proveedor. */
  trackId?: string;
  /** Estado al momento del envío ej. "SUBMITTED" o "EOK". */
  estadoSii?: string;
  /** URL de la operación en OPAI (solo si el cesionario tiene portal). */
  operationUrl?: string;
  /** Branding del cedente. */
  brandName?: string;
  logoUrl?: string;
  emailContacto?: string;
}

export const CesionNotificacionEmail = ({
  cesionarioRazonSocial = "Empresa de Factoring",
  contactoNombre,
  operationCode = "CES-",
  montoCesion = "$0",
  fechaCesion = "-",
  fechaVencimiento = "-",
  dteDescripcion = "-",
  cedenteRazonSocial = "Cedente",
  trackId,
  estadoSii,
  operationUrl,
  brandName = "OPAI",
  logoUrl = "",
  emailContacto = "",
}: CesionNotificacionEmailProps) => {
  const previewText = `Cesión electrónica ${operationCode} — ${montoCesion} registrada en el SII`;

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
            <Heading style={h1}>Cesión electrónica registrada</Heading>
            <Text style={greeting}>
              Estimad{contactoNombre ? "o/a" : "o/a"}{contactoNombre ? ` ${contactoNombre}` : ""} — {cesionarioRazonSocial}
            </Text>
            <Text style={body}>
              Se ha registrado una <strong>cesión electrónica de factura</strong> a su favor
              en el Registro Público de Transferencia de Crédito (RPETC) del SII.
              A continuación el detalle:
            </Text>

            {/* Tabla de datos */}
            <Section style={dataBox}>
              <DataRow label="Operación" value={operationCode} />
              <DataRow label="Cedente" value={cedenteRazonSocial} />
              <DataRow label="Documento cedido" value={dteDescripcion} />
              <DataRow label="Monto cedido" value={montoCesion} bold />
              <DataRow label="Fecha de cesión" value={fechaCesion} />
              <DataRow label="Fecha de vencimiento" value={fechaVencimiento} />
              {trackId ? <DataRow label="TrackId SII / Ref." value={trackId} mono /> : null}
              {estadoSii ? <DataRow label="Estado SII" value={estadoSii} /> : null}
            </Section>

            <Text style={body}>
              El AEC (Archivo Electrónico de Cesión) firmado digitalmente fue enviado al SII.
              Podrá consultar el estado de aceptación directamente en el portal SII o a
              través de su plataforma habitual en los próximos minutos.
            </Text>

            {operationUrl ? (
              <Text style={body}>
                Ver detalle de la operación:{" "}
                <a href={operationUrl} style={link}>
                  {operationUrl}
                </a>
              </Text>
            ) : null}
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Este es un correo automático generado por {brandName}. Si tiene dudas, comuníquese con{" "}
              {emailContacto ? (
                <a href={`mailto:${emailContacto}`} style={link}>{emailContacto}</a>
              ) : (
                "el equipo de finanzas del cedente"
              )}.
            </Text>
            <Text style={footerText}>
              © {new Date().getFullYear()} {brandName}. Todos los derechos reservados.
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

export default CesionNotificacionEmail;

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
