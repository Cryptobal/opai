/**
 * Email Template: CPQ Quote Email
 * Template para envío de cotizaciones CPQ
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface CpqQuoteEmailProps {
  recipientName: string;
  companyName: string;
  quoteCode: string;
  totalGuards: number;
  totalPositions: number;
  monthlyCost: string;
  senderName?: string;
  validUntil?: string;
  aiDescription?: string;
  serviceDetail?: string;
  businessName?: string;
  installationName?: string;
  // Tenant branding props
  brandName?: string;
  logoUrl?: string;
  website?: string;
  emailContact?: string;
  brandTagline?: string;
  // Portal access
  portalUrl?: string;
}

export const CpqQuoteEmail = ({
  recipientName = "Cliente",
  companyName = "Empresa",
  quoteCode = "CPQ-0001",
  totalGuards = 0,
  totalPositions = 0,
  monthlyCost = "$0",
  senderName = "Equipo Comercial",
  validUntil = "",
  aiDescription = "",
  serviceDetail = "",
  businessName = "",
  installationName = "",
  brandName = "Gard Security",
  logoUrl = "https://opai.gard.cl/Logo%20Gard%20Blanco.png",
  website = "https://www.gard.cl",
  emailContact = "comercial@gard.cl",
  brandTagline = "Servicios de Seguridad Profesional",
  portalUrl,
}: CpqQuoteEmailProps) => {
  const previewText = `Propuesta económica ${quoteCode} - ${brandName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={logoUrl}
              width="180"
              alt={brandName}
              style={logo}
            />
          </Section>

          <Section style={content}>
            <Heading style={heading}>Propuesta Económica</Heading>
            <Text style={subheading}>{quoteCode}</Text>

            <Text style={text}>
              Estimado/a <strong>{recipientName}</strong>,
            </Text>

            <Text style={text}>
              Adjunto encontrará la propuesta económica de servicios de seguridad
              para <strong>{companyName}</strong>.
            </Text>

            {aiDescription && (
              <>
                <Hr style={divider} />
                <Text style={text}>{aiDescription}</Text>
                <Hr style={divider} />
              </>
            )}

            {(businessName || installationName) && (
              <Section style={contextBox}>
                {businessName && (
                  <Text style={contextItem}>
                    <span style={contextLabel}>Negocio:</span> {businessName}
                  </Text>
                )}
                {installationName && (
                  <Text style={contextItem}>
                    <span style={contextLabel}>Instalación:</span> {installationName}
                  </Text>
                )}
              </Section>
            )}

            <Section style={infoBox}>
              <Text style={infoTitle}>Resumen de la propuesta</Text>
              <table style={infoTable}>
                <tbody>
                  <tr>
                    <td style={infoLabel}>Código</td>
                    <td style={infoValue}>{quoteCode}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Puestos de trabajo</td>
                    <td style={infoValue}>{totalPositions}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Guardias</td>
                    <td style={infoValue}>{totalGuards}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Costo mensual</td>
                    <td style={{ ...infoValue, fontWeight: "bold", color: "#14b8a6" }}>
                      {monthlyCost}
                    </td>
                  </tr>
                  {validUntil && (
                    <tr>
                      <td style={infoLabel}>Válida hasta</td>
                      <td style={infoValue}>{validUntil}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>

            {serviceDetail && (
              <Section style={serviceDetailBox}>
                <Text style={serviceDetailTitle}>Detalle del servicio</Text>
                <Text style={serviceDetailText}>{serviceDetail}</Text>
              </Section>
            )}

            <Text style={text}>
              El PDF detallado con el desglose completo se encuentra adjunto a
              este correo.
            </Text>

            <Text style={text}>
              Quedamos atentos a cualquier consulta.
            </Text>

            {portalUrl && (
              <Section style={portalSection}>
                <Text style={portalText}>
                  Accede a tu Portal de Cliente para revisar y aprobar esta cotización:
                </Text>
                <Button
                  href={portalUrl}
                  style={portalButton}
                >
                  Ver cotización en el portal
                </Button>
              </Section>
            )}

            <Text style={signature}>
              {senderName}
              <br />
              {brandName}
              <br />
              {emailContact}
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              {brandName} · {brandTagline}
              <br />
              {website.replace(/^https?:\/\//, '')} · {emailContact}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default CpqQuoteEmail;

// Styles — Gard Security brand: navy #1e3a8a, dark slate #0f172a, teal #14b8a6
const main = { backgroundColor: "#f8fafc", fontFamily: "Arial, sans-serif" };
const container = { maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff" };
const header = {
  backgroundColor: "#1e3a8a",
  padding: "28px 32px",
  textAlign: "center" as const,
  borderBottom: "3px solid #14b8a6",
};
const logo = { margin: "0 auto" };
const content = { padding: "32px", backgroundColor: "#ffffff" };
const heading = { color: "#0f172a", fontSize: "24px", margin: "0 0 4px", fontWeight: "bold" as const };
const subheading = { color: "#1e3a8a", fontSize: "14px", margin: "0 0 24px" };
const text = { color: "#334155", fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" };
const divider = { borderColor: "#e2e8f0", margin: "16px 0" };
const infoBox = {
  backgroundColor: "#f1f5f9",
  borderRadius: "8px",
  padding: "20px",
  margin: "20px 0",
  border: "1px solid #e2e8f0",
};
const infoTitle = {
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: "bold" as const,
  margin: "0 0 12px",
};
const infoTable = { width: "100%", borderCollapse: "collapse" as const };
const infoLabel = { color: "#64748b", fontSize: "13px", padding: "6px 0" };
const infoValue = { color: "#0f172a", fontSize: "13px", padding: "6px 0", textAlign: "right" as const };
const signature = { color: "#64748b", fontSize: "13px", lineHeight: "1.6", margin: "24px 0 0" };
const serviceDetailBox = {
  backgroundColor: "#f1f5f9",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
  border: "1px solid #e2e8f0",
  borderLeft: "3px solid #14b8a6",
};
const serviceDetailTitle = {
  color: "#1e3a8a",
  fontSize: "13px",
  fontWeight: "bold" as const,
  margin: "0 0 8px",
};
const serviceDetailText = {
  color: "#334155",
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0",
  whiteSpace: "pre-line" as const,
};
const footer = {
  padding: "16px 32px",
  textAlign: "center" as const,
  backgroundColor: "#0f172a",
};
const footerText = { color: "#94a3b8", fontSize: "11px", lineHeight: "1.4" };
const contextBox = {
  backgroundColor: "#f1f5f9",
  borderRadius: "8px",
  padding: "14px 20px",
  margin: "16px 0",
  border: "1px solid #e2e8f0",
  borderLeft: "3px solid #14b8a6",
};
const contextItem = {
  color: "#334155",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 4px",
};
const contextLabel = {
  color: "#1e3a8a",
  fontWeight: "bold" as const,
};
const portalSection = {
  textAlign: "center" as const,
  margin: "24px 0",
  padding: "20px",
  backgroundColor: "#f1f5f9",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
};
const portalText = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};
const portalButton = {
  backgroundColor: "#1e3a8a",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontWeight: "600" as const,
  textDecoration: "none",
  display: "inline-block",
};
