/**
 * Email Template: CPQ Quote Email
 * Template para envío de cotizaciones CPQ
 */

import {
  Body,
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
}: CpqQuoteEmailProps) => {
  const previewText = `Propuesta económica ${quoteCode} - Gard Security`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://opai.gard.cl/Logo%20Gard%20Blanco.png"
              width="180"
              alt="Gard Security"
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

            <Text style={signature}>
              {senderName}
              <br />
              Gard Security
              <br />
              comercial@gard.cl
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              Gard Security · Servicios de Seguridad Profesional
              <br />
              www.gard.cl · contacto@gard.cl
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default CpqQuoteEmail;

// Styles
const main = { backgroundColor: "#0a0a0a", fontFamily: "Arial, sans-serif" };
const container = { maxWidth: "600px", margin: "0 auto" };
const header = {
  backgroundColor: "#111111",
  padding: "24px 32px",
  textAlign: "center" as const,
  borderBottom: "2px solid #14b8a6",
};
const logo = { margin: "0 auto" };
const content = { padding: "32px" };
const heading = { color: "#ffffff", fontSize: "24px", margin: "0 0 4px", fontWeight: "bold" as const };
const subheading = { color: "#14b8a6", fontSize: "14px", margin: "0 0 24px" };
const text = { color: "#d4d4d4", fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" };
const divider = { borderColor: "#333333", margin: "16px 0" };
const infoBox = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "20px",
  margin: "20px 0",
  border: "1px solid #333333",
};
const infoTitle = {
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "bold" as const,
  margin: "0 0 12px",
};
const infoTable = { width: "100%", borderCollapse: "collapse" as const };
const infoLabel = { color: "#888888", fontSize: "13px", padding: "6px 0" };
const infoValue = { color: "#ffffff", fontSize: "13px", padding: "6px 0", textAlign: "right" as const };
const signature = { color: "#888888", fontSize: "13px", lineHeight: "1.6", margin: "24px 0 0" };
const serviceDetailBox = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
  border: "1px solid #333333",
  borderLeft: "3px solid #14b8a6",
};
const serviceDetailTitle = {
  color: "#14b8a6",
  fontSize: "13px",
  fontWeight: "bold" as const,
  margin: "0 0 8px",
};
const serviceDetailText = {
  color: "#d4d4d4",
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0",
  whiteSpace: "pre-line" as const,
};
const footer = {
  padding: "16px 32px",
  textAlign: "center" as const,
  borderTop: "1px solid #333333",
};
const footerText = { color: "#666666", fontSize: "11px", lineHeight: "1.4" };
const contextBox = {
  backgroundColor: "#1a1a1a",
  borderRadius: "8px",
  padding: "14px 20px",
  margin: "16px 0",
  border: "1px solid #333333",
  borderLeft: "3px solid #14b8a6",
};
const contextItem = {
  color: "#d4d4d4",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 0 4px",
};
const contextLabel = {
  color: "#14b8a6",
  fontWeight: "bold" as const,
};
