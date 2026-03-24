/**
 * Email Template: CPQ PDF Email
 * Diseño alineado con PortalProspectoInviteEmail: hero, credenciales, beneficios completos, trust banner.
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

interface CpqPdfEmailProps {
  recipientFirstName: string;
  recipientEmail?: string;
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
  recipientEmail,
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

  const rawParagraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Omitir primer párrafo si es solo "Hola X," (el hero ya tiene el saludo)
  const saludoRegex = /^Hola\s+[\wáéíóúñ]+\s*,?\s*$/i;
  const paragraphs = rawParagraphs.filter((p) => !saludoRegex.test(p));

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>

          {/* Header */}
          <Section style={header}>
            <Img src={logoUrl} width="160" alt={brandName} style={logo} />
            <Text style={headerTagline}>Portal de Seguridad Empresarial</Text>
          </Section>

          {/* Hero */}
          <Section style={hero}>
            <Text style={heroEyebrow}>PROPUESTA ECONÓMICA · {quoteCode}</Text>
            <Heading style={h1}>
              Hola {recipientFirstName}, tu propuesta<br />de seguridad está lista
            </Heading>
            <Text style={heroText}>
              <strong>{senderName}</strong> de {brandName} preparó una propuesta a medida
              {companyName || installationName ? ` para ${companyName || installationName}` : ""}.
              Adjunto el PDF y te invito a tu portal de cliente para una experiencia que nos diferencia.
            </Text>
          </Section>

          {/* Body text from AI (intro, PDF, cierre — sin repetir saludo) */}
          {paragraphs.length > 0 && (
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
          )}

          {/* Credentials + CTA — igual que PortalProspectoInviteEmail */}
          {portalUrl && (
            <>
              <Section style={credentialsSection}>
                <Text style={credentialsTitle}>🔐 Tus credenciales de acceso al portal</Text>
                <Row>
                  {recipientEmail && (
                    <Column style={credentialCol}>
                      <Text style={credentialLabel}>Correo electrónico</Text>
                      <Text style={credentialValue}>{recipientEmail}</Text>
                    </Column>
                  )}
                  <Column style={recipientEmail ? credentialColRight : credentialColFull}>
                    <Text style={credentialLabel}>PIN de acceso</Text>
                    <Text style={credentialValuePin}>{portalPin || "—"}</Text>
                  </Column>
                </Row>
                <Text style={credentialNote}>
                  Guarda este PIN en un lugar seguro. Lo necesitarás cada vez que ingreses al portal.
                </Text>
              </Section>

              <Section style={ctaSection}>
                <Button style={ctaButton} href={portalUrl}>
                  Acceder al portal →
                </Button>
                <Text style={ctaHint}>
                  Toda la información de tu propuesta está disponible únicamente en tu portal privado.
                </Text>
              </Section>
            </>
          )}

          <Hr style={divider} />

          {/* Benefits — igual que PortalProspectoInviteEmail */}
          <Section style={benefitsSection}>
            <Text style={benefitsTitle}>¿Qué encontrarás en tu portal?</Text>
            <Text style={benefitsSubtitle}>
              Un espacio exclusivo diseñado para que tomes decisiones con total información.
              No somos solo una empresa de guardias: somos tecnología aplicada a la seguridad.
            </Text>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>📋</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Propuesta detallada</Text>
                  <Text style={benefitDesc}>
                    Revisa los puestos de trabajo, guardias, horarios y precio mensual
                    de forma clara y transparente. Sin letra chica.
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>📄</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Documentación y detalle del servicio</Text>
                  <Text style={benefitDesc}>
                    Desde el portal revisa condiciones, metodología, respaldo legal y documentos
                    asociados a tu propuesta, en un solo lugar seguro.
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>📊</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Métricas de servicio en tiempo real</Text>
                  <Text style={benefitDesc}>
                    Una vez activo el contrato, monitorea cumplimiento, rondas
                    completadas y alertas de seguridad desde tu teléfono.
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>💬</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Canal directo con tu ejecutivo</Text>
                  <Text style={benefitDesc}>
                    Chat directo con {senderName} para resolver cualquier duda
                    sobre la propuesta, ajustar condiciones o agendar una reunión.
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>✅</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Aceptación digital en un clic</Text>
                  <Text style={benefitDesc}>
                    Si la propuesta te convence, puedes aprobarla directamente
                    desde el portal. Rápido, sin papeleo.
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>🛡️</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Historial y documentación</Text>
                  <Text style={benefitDesc}>
                    Toda tu documentación de contrato, cotizaciones y comunicaciones
                    en un solo lugar, siempre disponible.
                  </Text>
                </Column>
              </Row>
            </Section>
          </Section>

          <Hr style={divider} />

          {/* Trust banner — Por qué elegir Gard Security */}
          <Section style={trustSection}>
            <Text style={trustTitle}>Por qué elegir {brandName}</Text>
            <Row>
              <Column style={trustCol}>
                <Text style={trustStat}>+15 años</Text>
                <Text style={trustLabel}>de experiencia en seguridad</Text>
              </Column>
              <Column style={trustCol}>
                <Text style={trustStat}>OS-10</Text>
                <Text style={trustLabel}>Personal acreditado</Text>
              </Column>
              <Column style={trustCol}>
                <Text style={trustStat}>24/7</Text>
                <Text style={trustLabel}>Supervisión continua</Text>
              </Column>
            </Row>
          </Section>

          <Hr style={divider} />

          {/* Signature */}
          <Section style={signatureSection}>
            <Text style={signatureText}>
              Quedamos a tu disposición para cualquier consulta.
            </Text>
            <Text style={signatureName}>
              <strong>{senderName}</strong>
              <br />
              <span style={signatureRole}>{senderCargo} · {brandName}</span>
              <br />
              <span style={signatureContact}>{brandPhone}</span>
              <br />
              <Link href={`mailto:${brandEmail}`} style={signatureLink}>
                {brandEmail}
              </Link>
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerLinks}>
              <Link href="https://www.gard.cl" style={footerLink}>www.gard.cl</Link>
              {" · "}
              <Link href={`mailto:${brandEmail}`} style={footerLink}>{brandEmail}</Link>
              {quoteCode ? ` · Ref: ${quoteCode}` : ""}
            </Text>
            <Text style={footerSmall}>
              Este mensaje fue enviado por la plataforma comercial de {brandName}.
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

// ─── ESTILOS (alineados con PortalProspectoInviteEmail) ─────────────────────

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

const hero = {
  padding: "40px 40px 32px",
  borderBottom: "1px solid #e2e8f0",
};

const heroEyebrow = {
  color: "#1e3a8a",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
};

const h1 = {
  color: "#0f172a",
  fontSize: "26px",
  fontWeight: "700",
  lineHeight: "1.35",
  margin: "0 0 16px",
};

const heroText = {
  color: "#475569",
  fontSize: "15px",
  lineHeight: "1.7",
  margin: "0",
};

const bodySection = {
  padding: "24px 40px 8px",
};

const bodyPara = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: "1.75",
  margin: "0 0 16px",
  whiteSpace: "pre-line" as const,
};

const credentialsSection = {
  backgroundColor: "#f8fafc",
  margin: "0",
  padding: "28px 40px",
  borderTop: "1px solid #e2e8f0",
  borderBottom: "1px solid #e2e8f0",
};

const credentialsTitle = {
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: "600",
  margin: "0 0 20px",
};

const credentialCol = {
  width: "50%",
  paddingRight: "16px",
};

const credentialColRight = {
  width: "50%",
  paddingLeft: "16px",
};

const credentialColFull = {
  width: "100%",
};

const credentialLabel = {
  color: "#64748b",
  fontSize: "11px",
  fontWeight: "700",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
  margin: "0 0 6px",
};

const credentialValue = {
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: "600",
  fontFamily: "monospace",
  backgroundColor: "#e2e8f0",
  padding: "10px 14px",
  borderRadius: "8px",
  margin: "0",
  wordBreak: "break-all" as const,
};

const credentialValuePin = {
  color: "#1e3a8a",
  fontSize: "28px",
  fontWeight: "800",
  fontFamily: "monospace",
  backgroundColor: "#e2e8f0",
  padding: "10px 14px",
  borderRadius: "8px",
  margin: "0",
  letterSpacing: "6px",
  textAlign: "center" as const,
};

const credentialNote = {
  color: "#64748b",
  fontSize: "12px",
  margin: "16px 0 0",
  lineHeight: "1.5",
};

const ctaSection = {
  padding: "36px 40px 28px",
  textAlign: "center" as const,
};

const ctaHint = {
  color: "#64748b",
  fontSize: "13px",
  margin: "16px 0 0",
  lineHeight: "1.5",
};

const ctaButton = {
  backgroundColor: "#1e3a8a",
  borderRadius: "10px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "700",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "16px 40px",
};

const divider = {
  borderColor: "#e2e8f0",
  margin: "0",
};

const benefitsSection = {
  padding: "36px 40px",
};

const benefitsTitle = {
  color: "#0f172a",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0 0 8px",
};

const benefitsSubtitle = {
  color: "#475569",
  fontSize: "14px",
  margin: "0 0 28px",
  lineHeight: "1.5",
};

const benefitItem = {
  marginBottom: "20px",
};

const benefitIconCol = {
  width: "44px",
  paddingRight: "14px",
  verticalAlign: "top" as const,
};

const benefitIcon = {
  fontSize: "22px",
  margin: "0",
  lineHeight: "1",
};

const benefitName = {
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0 0 4px",
};

const benefitDesc = {
  color: "#475569",
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "0",
};

const trustSection = {
  padding: "28px 40px",
  backgroundColor: "#f8fafc",
};

const trustTitle = {
  color: "#475569",
  fontSize: "12px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
  margin: "0 0 20px",
  textAlign: "center" as const,
};

const trustCol = {
  width: "33%",
  textAlign: "center" as const,
};

const trustStat = {
  color: "#1e3a8a",
  fontSize: "22px",
  fontWeight: "800",
  margin: "0 0 4px",
};

const trustLabel = {
  color: "#64748b",
  fontSize: "12px",
  margin: "0",
  lineHeight: "1.4",
};

const signatureSection = {
  padding: "28px 40px",
};

const signatureText = {
  color: "#475569",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 12px",
};

const signatureName = {
  color: "#0f172a",
  fontSize: "15px",
  lineHeight: "1.5",
  margin: "0",
};

const signatureRole = {
  color: "#64748b",
  fontSize: "13px",
};

const signatureContact = {
  color: "#64748b",
  fontSize: "13px",
};

const signatureLink = {
  color: "#14b8a6",
  textDecoration: "underline",
};

const footer = {
  backgroundColor: "#0f172a",
  padding: "24px 40px",
  borderTop: "3px solid #1e3a8a",
};

const footerLinks = {
  color: "#94a3b8",
  fontSize: "13px",
  margin: "0 0 10px",
  textAlign: "center" as const,
};

const footerLink = {
  color: "#14b8a6",
  textDecoration: "none",
};

const footerSmall = {
  color: "#64748b",
  fontSize: "11px",
  lineHeight: "1.5",
  margin: "0 0 6px",
  textAlign: "center" as const,
};
