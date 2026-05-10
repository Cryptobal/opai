/**
 * Email Template: Billing Document (Proforma / Estado de Pago)
 *
 * Pattern idéntico a CpqQuoteEmail pero con copy y branding del documento
 * de cobro. Colores se inyectan por props (cascade tenant config →
 * empresa.brandingPrimaryColor → defaults).
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

export interface BillingDocumentEmailProps {
  variant: "PROFORMA" | "ESTADO_DE_PAGO";
  recipientName: string;
  receiverCompanyName: string;
  /** Ej: "Proforma N° P05048" o "Estado de Pago Marzo 2026". */
  documentTitle: string;
  /** Ej: "Servicio de Vigilancia · Sub Estación Los Poetas". */
  documentSubtitle: string;
  emisorRazonSocial: string;
  emisorRut: string;
  totalFormatted: string;
  netFormatted: string;
  taxFormatted: string;
  emissionDate: string;
  numeroOrdenContrato?: string | null;
  /** HTML sanitizado del intro custom del tenant. */
  introHtml?: string | null;
  footerLegalText?: string | null;

  // Branding tenant
  brandName: string;
  logoUrl: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  brandTagline: string;
  website: string;
  emailContact: string;
  senderName?: string;
  portalUrl?: string;
}

export const BillingDocumentEmail = ({
  variant,
  recipientName = "Cliente",
  receiverCompanyName = "Empresa",
  documentTitle = "Documento de Cobro",
  documentSubtitle = "",
  emisorRazonSocial = "",
  emisorRut = "",
  totalFormatted = "$0",
  netFormatted = "$0",
  taxFormatted = "$0",
  emissionDate = "",
  numeroOrdenContrato = null,
  introHtml = null,
  footerLegalText = null,
  brandName = "OPAI",
  logoUrl = "",
  brandPrimaryColor = "#0D1117",
  brandSecondaryColor = "#0066FF",
  brandTagline = "",
  website = "",
  emailContact = "",
  senderName = "Equipo Comercial",
  portalUrl,
}: BillingDocumentEmailProps) => {
  const previewText = `${documentTitle} · ${brandName}`;

  const heading = {
    color: brandPrimaryColor,
    fontSize: "22px",
    margin: "0 0 4px",
    fontWeight: "bold" as const,
  };
  const subheading = {
    color: brandPrimaryColor,
    fontSize: "13px",
    margin: "0 0 24px",
  };
  const headerStyle = {
    backgroundColor: brandPrimaryColor,
    padding: "26px 32px",
    textAlign: "center" as const,
    borderBottom: `3px solid ${brandSecondaryColor}`,
  };
  const totalAccent = {
    color: brandPrimaryColor,
    fontSize: "16px",
    fontWeight: "bold" as const,
    padding: "6px 0",
    textAlign: "right" as const,
  };
  const portalButton = {
    backgroundColor: brandPrimaryColor,
    color: "#ffffff",
    padding: "12px 24px",
    borderRadius: "6px",
    fontWeight: "600" as const,
    fontSize: "14px",
    textDecoration: "none",
    display: "inline-block" as const,
  };

  const defaultIntroProforma = (
    <>
      <Text style={text}>
        Estimado/a <strong>{recipientName}</strong>,
      </Text>
      <Text style={text}>
        Adjunto encontrará la <strong>proforma</strong> del servicio para
        su revisión y aprobación. Este documento es referencial y no
        constituye documento tributario electrónico. Una vez aprobada,
        procederemos con la emisión de la factura electrónica al SII.
      </Text>
    </>
  );

  const defaultIntroEstadoPago = (
    <>
      <Text style={text}>
        Estimado/a <strong>{recipientName}</strong>,
      </Text>
      <Text style={text}>
        Adjunto encontrará el <strong>Estado de Pago</strong>{" "}
        correspondiente al período. Por favor revisar y comunicar
        conformidad para proceder con la facturación electrónica.
      </Text>
    </>
  );

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerStyle}>
            {logoUrl ? (
              <Img src={logoUrl} width="180" alt={brandName} style={logo} />
            ) : (
              <Text style={{ color: "#fff", fontSize: "20px", fontWeight: "bold" as const, letterSpacing: "1.5px" }}>
                {brandName}
              </Text>
            )}
          </Section>

          <Section style={content}>
            <Heading style={heading}>{documentTitle}</Heading>
            {documentSubtitle ? (
              <Text style={subheading}>{documentSubtitle}</Text>
            ) : null}

            {introHtml ? (
              <div
                style={text}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: introHtml }}
              />
            ) : variant === "PROFORMA" ? (
              defaultIntroProforma
            ) : (
              defaultIntroEstadoPago
            )}

            <Section style={infoBox}>
              <Text style={infoTitle}>Detalle del documento</Text>
              <table style={infoTable}>
                <tbody>
                  <tr>
                    <td style={infoLabel}>Cliente</td>
                    <td style={infoValue}>{receiverCompanyName}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Emisor</td>
                    <td style={infoValue}>
                      {emisorRazonSocial} · {emisorRut}
                    </td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Fecha emisión</td>
                    <td style={infoValue}>{emissionDate}</td>
                  </tr>
                  {numeroOrdenContrato ? (
                    <tr>
                      <td style={infoLabel}>N° Orden / Contrato</td>
                      <td style={infoValue}>{numeroOrdenContrato}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td style={infoLabel}>Neto</td>
                    <td style={infoValue}>{netFormatted}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>IVA</td>
                    <td style={infoValue}>{taxFormatted}</td>
                  </tr>
                  <tr>
                    <td style={{ ...infoLabel, fontWeight: "bold" as const }}>
                      Total
                    </td>
                    <td style={totalAccent}>{totalFormatted}</td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Hr style={divider} />

            <Text style={text}>
              El detalle completo se encuentra en el archivo PDF adjunto.
            </Text>

            {portalUrl ? (
              <Section style={portalSection}>
                <Text style={portalText}>
                  También puedes ver este documento en el portal del cliente:
                </Text>
                <Button href={portalUrl} style={portalButton}>
                  Ver en el portal
                </Button>
              </Section>
            ) : null}

            <Text style={signature}>
              {senderName}
              {brandName ? <><br />{brandName}</> : null}
              {emailContact ? <><br />{emailContact}</> : null}
            </Text>

            {footerLegalText ? (
              <Text
                style={{
                  ...text,
                  fontSize: "11px",
                  color: "#64748b",
                  marginTop: "16px",
                  fontStyle: "italic",
                }}
              >
                {footerLegalText}
              </Text>
            ) : null}
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              {brandName}
              {brandTagline ? ` · ${brandTagline}` : ""}
            </Text>
            <Text style={footerText}>
              {website}
              {website && emailContact ? " · " : ""}
              {emailContact}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default BillingDocumentEmail;

// ── Estilos compartidos ──
const main = { backgroundColor: "#f8fafc", fontFamily: "Arial, sans-serif" };
const container = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
};
const logo = { margin: "0 auto" };
const content = { padding: "32px", backgroundColor: "#ffffff" };
const text = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};
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
const infoValue = {
  color: "#0f172a",
  fontSize: "13px",
  padding: "6px 0",
  textAlign: "right" as const,
};
const signature = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "24px 0 0",
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
const footer = {
  padding: "16px 32px",
  textAlign: "center" as const,
  backgroundColor: "#0f172a",
};
const footerText = {
  color: "#94a3b8",
  fontSize: "11px",
  lineHeight: "1.4",
  margin: "2px 0",
};
