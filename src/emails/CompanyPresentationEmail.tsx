/**
 * Email Template: Company Presentation
 *
 * Sent when an ejecutivo shares the company presentation with a prospect.
 * Compatible with Resend + React Email.
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
  Row,
  Column,
} from "@react-email/components";
import * as React from "react";

export interface PresentationEmailBenefit {
  icon: string;
  name: string;
  desc: string;
}

const DEFAULT_BENEFITS: PresentationEmailBenefit[] = [
  {
    icon: "🛡️",
    name: "Servicios de seguridad",
    desc: "Guardias certificados, seguridad electrónica, monitoreo 24/7 y más.",
  },
  {
    icon: "🏆",
    name: "Certificaciones",
    desc: "OS-10, Ley 21.659, D.S. 44 y todo nuestro marco normativo.",
  },
  {
    icon: "💻",
    name: "Tecnología propia",
    desc: "Plataforma con rondas GPS, portal de cliente, reportería automatizada y más.",
  },
];

interface CompanyPresentationEmailProps {
  contactName: string;
  companyName: string;
  email: string;
  pin?: string;
  portalUrl: string;
  ejecutivoName: string;
  notes?: string;
  brandName?: string;
  logoUrl?: string;
  /** Bullets de "¿qué encontrarás?" tenant-driven. Si se omite, usa defaults. */
  benefits?: PresentationEmailBenefit[];
}

export const CompanyPresentationEmail = ({
  contactName = "Cliente",
  companyName = "Empresa Demo",
  email = "cliente@empresa.com",
  pin,
  portalUrl = "",
  ejecutivoName = "Ejecutivo Comercial",
  notes,
  brandName = "OPAI",
  logoUrl = "",
  benefits,
}: CompanyPresentationEmailProps) => {
  const benefitItems =
    benefits && benefits.length > 0 ? benefits : DEFAULT_BENEFITS;
  const previewText = `${companyName} — Presentación de servicios de ${brandName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                width="160"
                alt={brandName}
                style={logo}
              />
            ) : null}
            <Text style={headerTagline}>Presentación de Servicios</Text>
          </Section>

          {/* Hero */}
          <Section style={hero}>
            <Text style={heroEyebrow}>PRESENTACIÓN DE EMPRESA</Text>
            <Heading style={h1}>
              Estimado/a {contactName}
            </Heading>
            <Text style={heroText}>
              <strong>{ejecutivoName}</strong> de {brandName} le comparte
              nuestra presentación de servicios de seguridad. En ella encontrará
              información sobre nuestros servicios, certificaciones, tecnología
              y diferenciadores.
            </Text>
          </Section>

          {/* Notes from ejecutivo */}
          {notes && (
            <Section style={notesSection}>
              <Text style={notesLabel}>Mensaje de {ejecutivoName}:</Text>
              <Text style={notesText}>{notes}</Text>
            </Section>
          )}

          {/* Credentials Box — only if PIN is provided (first-time access) */}
          {pin && (
            <Section style={credentialsSection}>
              <Text style={credentialsTitle}>
                Tus credenciales de acceso
              </Text>
              <Row>
                <Column style={credentialCol}>
                  <Text style={credentialLabel}>Correo electrónico</Text>
                  <Text style={credentialValue}>{email}</Text>
                </Column>
                <Column style={credentialColRight}>
                  <Text style={credentialLabel}>PIN de acceso</Text>
                  <Text style={credentialValuePin}>{pin}</Text>
                </Column>
              </Row>
              <Text style={credentialNote}>
                Guarda este PIN en un lugar seguro. Lo necesitarás cada vez que
                ingreses al portal.
              </Text>
            </Section>
          )}

          {/* CTA */}
          <Section style={ctaSection}>
            <Button style={ctaButton} href={portalUrl}>
              Ver Presentación →
            </Button>
          </Section>

          <Hr style={divider} />

          {/* What you'll find */}
          <Section style={benefitsSection}>
            <Text style={benefitsTitle}>
              ¿Qué encontrarás en la presentación?
            </Text>

            {benefitItems.map((b, i) => (
              <Section style={benefitItem} key={i}>
                <Row>
                  <Column style={benefitIconCol}>
                    <Text style={benefitIcon}>{b.icon}</Text>
                  </Column>
                  <Column>
                    <Text style={benefitName}>{b.name}</Text>
                    <Text style={benefitDesc}>{b.desc}</Text>
                  </Column>
                </Row>
              </Section>
            ))}
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Enviado por {ejecutivoName} · {brandName}
            </Text>
            <Text style={footerSmall}>
              Si no esperabas este correo, puedes ignorarlo de forma segura.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default CompanyPresentationEmail;

// ─── Styles ───────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: "#0a0a0f",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#111118",
  borderRadius: "12px",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  backgroundColor: "#0d1117",
  padding: "28px 32px",
  textAlign: "center" as const,
  borderBottom: "1px solid #1e293b",
};

const logo: React.CSSProperties = {
  margin: "0 auto",
};

const headerTagline: React.CSSProperties = {
  color: "#14b8a6",
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "1.5px",
  textTransform: "uppercase" as const,
  margin: "12px 0 0 0",
};

const hero: React.CSSProperties = {
  padding: "40px 32px 24px",
  textAlign: "center" as const,
};

const heroEyebrow: React.CSSProperties = {
  color: "#14b8a6",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 12px 0",
};

const h1: React.CSSProperties = {
  color: "#f1f5f9",
  fontSize: "26px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 16px 0",
};

const heroText: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0",
};

const notesSection: React.CSSProperties = {
  margin: "0 32px 24px",
  padding: "16px 20px",
  backgroundColor: "#1e293b",
  borderRadius: "8px",
  borderLeft: "3px solid #14b8a6",
};

const notesLabel: React.CSSProperties = {
  color: "#14b8a6",
  fontSize: "12px",
  fontWeight: "600",
  margin: "0 0 8px 0",
};

const notesText: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0",
  fontStyle: "italic" as const,
};

const credentialsSection: React.CSSProperties = {
  margin: "0 32px 24px",
  padding: "20px",
  backgroundColor: "#0f172a",
  borderRadius: "8px",
  border: "1px solid #1e3a5f",
};

const credentialsTitle: React.CSSProperties = {
  color: "#f1f5f9",
  fontSize: "15px",
  fontWeight: "600",
  margin: "0 0 16px 0",
  textAlign: "center" as const,
};

const credentialCol: React.CSSProperties = {
  width: "50%",
  paddingRight: "8px",
};

const credentialColRight: React.CSSProperties = {
  width: "50%",
  paddingLeft: "8px",
  textAlign: "center" as const,
};

const credentialLabel: React.CSSProperties = {
  color: "#64748b",
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 4px 0",
};

const credentialValue: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: "14px",
  fontWeight: "500",
  margin: "0",
  wordBreak: "break-all" as const,
};

const credentialValuePin: React.CSSProperties = {
  color: "#14b8a6",
  fontSize: "28px",
  fontWeight: "800",
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  letterSpacing: "6px",
  margin: "0",
};

const credentialNote: React.CSSProperties = {
  color: "#64748b",
  fontSize: "11px",
  textAlign: "center" as const,
  margin: "12px 0 0 0",
};

const ctaSection: React.CSSProperties = {
  padding: "0 32px 32px",
  textAlign: "center" as const,
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#14b8a6",
  color: "#ffffff",
  padding: "14px 32px",
  borderRadius: "8px",
  fontSize: "15px",
  fontWeight: "700",
  textDecoration: "none",
  display: "inline-block",
};

const divider: React.CSSProperties = {
  borderColor: "#1e293b",
  margin: "0 32px",
};

const benefitsSection: React.CSSProperties = {
  padding: "28px 32px",
};

const benefitsTitle: React.CSSProperties = {
  color: "#f1f5f9",
  fontSize: "17px",
  fontWeight: "600",
  margin: "0 0 20px 0",
  textAlign: "center" as const,
};

const benefitItem: React.CSSProperties = {
  marginBottom: "16px",
};

const benefitIconCol: React.CSSProperties = {
  width: "40px",
  verticalAlign: "top",
};

const benefitIcon: React.CSSProperties = {
  fontSize: "20px",
  margin: "0",
};

const benefitName: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0 0 2px 0",
};

const benefitDesc: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0",
};

const footer: React.CSSProperties = {
  padding: "24px 32px",
  textAlign: "center" as const,
  backgroundColor: "#0d1117",
  borderTop: "1px solid #1e293b",
};

const footerText: React.CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  margin: "0 0 4px 0",
};

const footerSmall: React.CSSProperties = {
  color: "#475569",
  fontSize: "11px",
  margin: "0",
};
