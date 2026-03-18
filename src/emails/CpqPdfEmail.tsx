/**
 * Email Template: CPQ PDF Email
 * Template con diseño visual para el envío de propuesta económica en PDF.
 * Reemplaza el wrapper HTML básico de send-pdf-email.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface CpqPdfEmailProps {
  recipientFirstName: string;
  companyName?: string;
  quoteCode: string;
  installationName?: string;
  bodyText: string;
  senderName: string;
  senderCargo?: string;
  brandName?: string;
  brandPhone?: string;
  brandEmail?: string;
  logoUrl?: string;
  portalUrl?: string;
  portalPin?: string | null;
}

export const CpqPdfEmail = ({
  recipientFirstName = "Cliente",
  companyName,
  quoteCode = "CPQ-0001",
  installationName,
  bodyText = "",
  senderName = "Equipo Comercial",
  senderCargo = "Director Comercial",
  brandName = "Gard Security",
  brandPhone = "+56 9 8230 7771",
  brandEmail = "comercial@gard.cl",
  logoUrl = "https://opai.gard.cl/Logo%20Gard%20Blanco.png",
  portalUrl,
  portalPin,
}: CpqPdfEmailProps) => {
  const previewText = `Hola ${recipientFirstName}, te adjunto la propuesta económica de ${brandName}`;

  // Render bodyText preserving line breaks as <br> — but strip the
  // auto-generated portal/signature block from the AI body since we render
  // those sections separately below.
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>

          {/* Header */}
          <Section style={header}>
            <Img
              src={logoUrl}
              width="160"
              alt={brandName}
              style={logo}
            />
            <Text style={headerTagline}>Portal de Seguridad Empresarial</Text>
          </Section>

          {/* Eyebrow */}
          <Section style={eyebrowSection}>
            <Text style={eyebrow}>PROPUESTA ECONÓMICA · {quoteCode}</Text>
            {(companyName || installationName) && (
              <Text style={eyebrowSub}>
                {[companyName, installationName].filter(Boolean).join(" — ")}
              </Text>
            )}
          </Section>

          {/* Body text — paragraphs from AI */}
          <Section style={bodySection}>
            {paragraphs.map((para, i) => (
              <Text key={i} style={bodyPara}>
                {para.split("\n").map((line, j, arr) => (
                  <React.Fragment key={j}>
                    {line}
                    {j < arr.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </Text>
            ))}
          </Section>

          {/* Portal CTA — shown only if portalUrl is provided */}
          {portalUrl && (
            <>
              <Hr style={divider} />
              <Section style={portalSection}>
                <Text style={portalTitle}>🔐 Tu acceso al Portal de Cliente</Text>
                <Text style={portalDesc}>
                  Ingresa a tu portal privado para revisar la propuesta de forma interactiva,
                  consultar el detalle del servicio y, si te convence, aprobarla en un clic.
                </Text>
                <Button href={portalUrl} style={portalButton}>
                  Ingresar a mi portal →
                </Button>
                {portalPin && (
                  <Text style={pinText}>
                    Tu PIN de acceso: <strong style={pinValue}>{portalPin}</strong>
                  </Text>
                )}
              </Section>
            </>
          )}

          {/* Benefits strip */}
          <Section style={benefitsStrip}>
            <table style={benefitsTable}>
              <tbody>
                <tr>
                  <td style={benefitCell}>
                    <Text style={benefitIcon}>📋</Text>
                    <Text style={benefitLabel}>Propuesta detallada</Text>
                  </td>
                  <td style={benefitCell}>
                    <Text style={benefitIcon}>📊</Text>
                    <Text style={benefitLabel}>Monitoreo en tiempo real</Text>
                  </td>
                  <td style={benefitCell}>
                    <Text style={benefitIcon}>✅</Text>
                    <Text style={benefitLabel}>Aprobación en un clic</Text>
                  </td>
                  <td style={benefitCell}>
                    <Text style={benefitIcon}>💬</Text>
                    <Text style={benefitLabel}>Canal directo con tu ejecutivo</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={divider} />

          {/* Signature */}
          <Section style={signatureSection}>
            <Text style={signatureName}>{senderName}</Text>
            {senderCargo && <Text style={signatureRole}>{senderCargo}</Text>}
            <Text style={signatureBrand}>{brandName}</Text>
            {brandPhone && <Text style={signatureContact}>{brandPhone}</Text>}
            {brandEmail && <Text style={signatureContact}>{brandEmail}</Text>}
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              {brandName} · comercial@gard.cl · www.gard.cl
            </Text>
            <Text style={footerSmall}>
              © {new Date().getFullYear()} {brandName} SpA. Todos los derechos reservados.
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
};

export default CpqPdfEmail;

// ─── ESTILOS ─────────────────────────────────────────────────────────────────

const main = {
  backgroundColor: "#f1f5f9",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  marginTop: "20px",
  marginBottom: "40px",
  maxWidth: "600px",
  borderRadius: "16px",
  overflow: "hidden" as const,
  boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  border: "1px solid #e2e8f0",
};

const header = {
  backgroundColor: "#1e3a8a",
  padding: "32px 40px 24px",
  textAlign: "center" as const,
  borderBottom: "3px solid #14b8a6",
};

const logo = { margin: "0 auto", display: "block" };

const headerTagline = {
  color: "#93c5fd",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "12px 0 0",
};

const eyebrowSection = {
  padding: "28px 40px 12px",
  borderBottom: "1px solid #f1f5f9",
};

const eyebrow = {
  color: "#1e3a8a",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 6px",
};

const eyebrowSub = {
  color: "#475569",
  fontSize: "13px",
  margin: "0",
};

const bodySection = {
  padding: "28px 40px 8px",
};

const bodyPara = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: "1.75",
  margin: "0 0 18px",
  whiteSpace: "pre-line" as const,
};

const divider = {
  borderColor: "#e2e8f0",
  margin: "0",
};

const portalSection = {
  backgroundColor: "#f8fafc",
  padding: "28px 40px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "center" as const,
};

const portalTitle = {
  color: "#0f172a",
  fontSize: "16px",
  fontWeight: "700",
  margin: "0 0 10px",
};

const portalDesc = {
  color: "#475569",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 20px",
};

const portalButton = {
  backgroundColor: "#1e3a8a",
  borderRadius: "10px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "700",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "14px 36px",
};

const pinText = {
  color: "#475569",
  fontSize: "13px",
  margin: "18px 0 0",
};

const pinValue = {
  color: "#1e3a8a",
  fontFamily: "monospace",
  fontSize: "18px",
  letterSpacing: "4px",
};

const benefitsStrip = {
  padding: "20px 40px",
  backgroundColor: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
};

const benefitsTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const benefitCell = {
  textAlign: "center" as const,
  padding: "0 8px",
  verticalAlign: "top" as const,
  width: "25%",
};

const benefitIcon = {
  fontSize: "20px",
  margin: "0 0 4px",
  lineHeight: "1",
};

const benefitLabel = {
  color: "#475569",
  fontSize: "11px",
  lineHeight: "1.4",
  margin: "0",
};

const signatureSection = {
  padding: "28px 40px 20px",
};

const signatureName = {
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: "700",
  margin: "0 0 2px",
};

const signatureRole = {
  color: "#475569",
  fontSize: "13px",
  margin: "0 0 2px",
};

const signatureBrand = {
  color: "#1e3a8a",
  fontSize: "13px",
  fontWeight: "600",
  margin: "0 0 4px",
};

const signatureContact = {
  color: "#64748b",
  fontSize: "13px",
  margin: "0 0 2px",
};

const footer = {
  backgroundColor: "#0f172a",
  padding: "20px 40px",
  borderTop: "3px solid #1e3a8a",
  textAlign: "center" as const,
};

const footerText = {
  color: "#94a3b8",
  fontSize: "12px",
  margin: "0 0 6px",
};

const footerSmall = {
  color: "#64748b",
  fontSize: "11px",
  margin: "0",
};
