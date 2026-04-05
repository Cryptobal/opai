/**
 * Email Template: Registro Demo — Bienvenida con credenciales
 *
 * Se envía al prospecto que se auto-registra desde /registro-demo.
 * Compatible con Resend + React Email.
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
} from '@react-email/components';
import * as React from 'react';

interface RegistroDemoEmailProps {
  contactName: string;
  companyName: string;
  email: string;
  pin: string;
  portalUrl: string;
  industry: string;
  brandName?: string;
  logoUrl?: string;
  website?: string;
  emailContact?: string;
}

export const RegistroDemoEmail = ({
  contactName = 'Cliente',
  companyName = 'Empresa Demo',
  email = 'cliente@empresa.com',
  pin = '123456',
  portalUrl = '',
  industry = 'Seguridad',
  brandName = 'OPAI',
  logoUrl = '',
  website = '',
  emailContact = '',
}: RegistroDemoEmailProps) => {
  const firstName = contactName.split(/\s+/)[0] || contactName;
  const previewText = `${firstName}, su cuenta demo en el portal está lista. Acceda con su correo y PIN.`;
  const portalUrlWithEmail = `${portalUrl}?email=${encodeURIComponent(email)}`;

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

          {/* Hero */}
          <Section style={hero}>
            <Text style={heroEyebrow}>ACCESO DEMO</Text>
            <Heading style={h1}>
              Bienvenido al Portal de<br />Clientes, {firstName}
            </Heading>
            <Text style={heroText}>
              Hemos creado una cuenta de demostración para{' '}
              <strong>{companyName}</strong> para que conozca nuestra
              plataforma de gestión de seguridad en tiempo real.
            </Text>
          </Section>

          {/* Credentials Box */}
          <Section style={credentialsSection}>
            <Text style={credentialsTitle}>Sus credenciales de acceso</Text>
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
              Guarde este PIN en un lugar seguro. Lo necesitará cada vez que ingrese al portal.
            </Text>
          </Section>

          {/* CTA */}
          <Section style={ctaSection}>
            <Button style={ctaButton} href={portalUrlWithEmail}>
              Acceder a mi portal
            </Button>
            <Text style={ctaHint}>
              Ingrese con su correo y PIN para explorar todas las funcionalidades.
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Benefits */}
          <Section style={benefitsSection}>
            <Text style={benefitsTitle}>¿Qué encontrará en su portal?</Text>
            <Text style={benefitsSubtitle}>
              Un espacio exclusivo para conocer cómo {brandName} gestiona la seguridad de sus clientes.
            </Text>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>📊</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Dashboard en tiempo real</Text>
                  <Text style={benefitDesc}>
                    Visualice el estado de sus instalaciones, guardias en servicio
                    y métricas clave de seguridad, todo en un solo lugar.
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>🔄</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Control de rondas y asistencia</Text>
                  <Text style={benefitDesc}>
                    Monitoree las rondas de seguridad completadas y la asistencia
                    de guardias con verificación GPS y biométrica.
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>📋</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Reportes automáticos</Text>
                  <Text style={benefitDesc}>
                    Reciba reportes detallados de novedades, incidencias y
                    cumplimiento sin tener que pedirlos.
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={benefitItem}>
              <Row>
                <Column style={benefitIconCol}>
                  <Text style={benefitIcon}>🎫</Text>
                </Column>
                <Column>
                  <Text style={benefitName}>Sistema de tickets</Text>
                  <Text style={benefitDesc}>
                    Levante solicitudes y requerimientos directamente desde el
                    portal. Seguimiento transparente de cada caso.
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
                  <Text style={benefitName}>Documentación centralizada</Text>
                  <Text style={benefitDesc}>
                    Acceda a protocolos, pautas de servicio y toda la documentación
                    de seguridad de sus instalaciones.
                  </Text>
                </Column>
              </Row>
            </Section>
          </Section>

          <Hr style={divider} />

          {/* Trust banner */}
          <Section style={trustSection}>
            <Text style={trustTitle}>Por qué elegirnos</Text>
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
              Si desea conversar sobre cómo {brandName} puede ayudar a {companyName},
              no dude en contactarnos.
            </Text>
            <Text style={signatureName}>
              <strong>Equipo Comercial</strong><br />
              <span style={signatureRole}>{brandName}</span>
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerLinks}>
              {website && (
                <Link href={website} style={footerLink}>{website.replace(/^https?:\/\//, '')}</Link>
              )}
              {website && emailContact && ' · '}
              {emailContact && (
                <Link href={`mailto:${emailContact}`} style={footerLink}>{emailContact}</Link>
              )}
            </Text>
            <Text style={footerSmall}>
              Este mensaje fue enviado a {email} porque se registró en el Portal de Clientes de {brandName}.
              Si no realizó este registro, puede ignorar este correo.
            </Text>
            <Text style={footerSmall}>
              © {new Date().getFullYear()} {brandName}. Todos los derechos reservados.
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
};

export default RegistroDemoEmail;

// ─── ESTILOS ───────────────────────────────────────────────

const main = {
  backgroundColor: '#f1f5f9',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  marginTop: '20px',
  marginBottom: '40px',
  maxWidth: '600px',
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  border: '1px solid #e2e8f0',
};

const header = {
  backgroundColor: '#1e3a8a',
  padding: '32px 40px 24px',
  textAlign: 'center' as const,
  borderBottom: '3px solid #14b8a6',
};

const logo = { margin: '0 auto', display: 'block' };

const headerTagline = {
  color: '#93c5fd',
  fontSize: '11px',
  fontWeight: '600',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  margin: '12px 0 0',
};

const hero = {
  padding: '40px 40px 32px',
  borderBottom: '1px solid #e2e8f0',
};

const heroEyebrow = {
  color: '#1e3a8a',
  fontSize: '11px',
  fontWeight: '700',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  margin: '0 0 12px',
};

const h1 = {
  color: '#0f172a',
  fontSize: '26px',
  fontWeight: '700',
  lineHeight: '1.35',
  margin: '0 0 16px',
};

const heroText = {
  color: '#475569',
  fontSize: '15px',
  lineHeight: '1.7',
  margin: '0',
};

const credentialsSection = {
  backgroundColor: '#f8fafc',
  margin: '0',
  padding: '28px 40px',
  borderTop: '1px solid #e2e8f0',
  borderBottom: '1px solid #e2e8f0',
};

const credentialsTitle = {
  color: '#0f172a',
  fontSize: '15px',
  fontWeight: '600',
  margin: '0 0 20px',
};

const credentialCol = {
  width: '50%',
  paddingRight: '16px',
};

const credentialColRight = {
  width: '50%',
  paddingLeft: '16px',
};

const credentialLabel = {
  color: '#64748b',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '0 0 6px',
};

const credentialValue = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: '600',
  fontFamily: 'monospace',
  backgroundColor: '#e2e8f0',
  padding: '10px 14px',
  borderRadius: '8px',
  margin: '0',
  wordBreak: 'break-all' as const,
};

const credentialValuePin = {
  color: '#1e3a8a',
  fontSize: '28px',
  fontWeight: '800',
  fontFamily: 'monospace',
  backgroundColor: '#e2e8f0',
  padding: '10px 14px',
  borderRadius: '8px',
  margin: '0',
  letterSpacing: '6px',
  textAlign: 'center' as const,
};

const credentialNote = {
  color: '#64748b',
  fontSize: '12px',
  margin: '16px 0 0',
  lineHeight: '1.5',
};

const ctaSection = {
  padding: '36px 40px 28px',
  textAlign: 'center' as const,
};

const ctaButton = {
  backgroundColor: '#1e3a8a',
  borderRadius: '10px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '700',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 40px',
};

const ctaHint = {
  color: '#64748b',
  fontSize: '13px',
  margin: '16px 0 0',
  lineHeight: '1.5',
};

const divider = {
  borderColor: '#e2e8f0',
  margin: '0',
};

const benefitsSection = {
  padding: '36px 40px',
};

const benefitsTitle = {
  color: '#0f172a',
  fontSize: '18px',
  fontWeight: '700',
  margin: '0 0 8px',
};

const benefitsSubtitle = {
  color: '#475569',
  fontSize: '14px',
  margin: '0 0 28px',
  lineHeight: '1.5',
};

const benefitItem = {
  marginBottom: '20px',
};

const benefitIconCol = {
  width: '44px',
  paddingRight: '14px',
  verticalAlign: 'top' as const,
};

const benefitIcon = {
  fontSize: '22px',
  margin: '0',
  lineHeight: '1',
};

const benefitName = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px',
};

const benefitDesc = {
  color: '#475569',
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '0',
};

const trustSection = {
  padding: '28px 40px',
  backgroundColor: '#f8fafc',
};

const trustTitle = {
  color: '#475569',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '0 0 20px',
  textAlign: 'center' as const,
};

const trustCol = {
  width: '33%',
  textAlign: 'center' as const,
};

const trustStat = {
  color: '#1e3a8a',
  fontSize: '22px',
  fontWeight: '800',
  margin: '0 0 4px',
};

const trustLabel = {
  color: '#64748b',
  fontSize: '12px',
  margin: '0',
  lineHeight: '1.4',
};

const signatureSection = {
  padding: '28px 40px',
};

const signatureText = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 12px',
};

const signatureName = {
  color: '#0f172a',
  fontSize: '15px',
  lineHeight: '1.5',
  margin: '0',
};

const signatureRole = {
  color: '#64748b',
  fontSize: '13px',
};

const footer = {
  backgroundColor: '#0f172a',
  padding: '24px 40px',
  borderTop: '3px solid #1e3a8a',
};

const footerLinks = {
  color: '#94a3b8',
  fontSize: '13px',
  margin: '0 0 10px',
  textAlign: 'center' as const,
};

const footerLink = {
  color: '#14b8a6',
  textDecoration: 'none',
};

const footerSmall = {
  color: '#64748b',
  fontSize: '11px',
  lineHeight: '1.5',
  margin: '0 0 6px',
  textAlign: 'center' as const,
};
