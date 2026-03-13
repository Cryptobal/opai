/**
 * Email Template: Portal Prospecto Invitation
 *
 * Invitacion al portal de prospectos con credenciales de acceso.
 * Compatible con Resend + React Email
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
} from '@react-email/components';
import * as React from 'react';

interface PortalProspectoInviteEmailProps {
  contactName: string;
  companyName: string;
  email: string;
  pin: string;
  portalUrl: string;
  ejecutivoName: string;
}

export const PortalProspectoInviteEmail = ({
  contactName = 'Cliente',
  companyName = 'Empresa Demo',
  email = 'cliente@empresa.com',
  pin = '1234',
  portalUrl = 'https://opai.gard.cl/portal/cliente',
  ejecutivoName = 'Ejecutivo Comercial',
}: PortalProspectoInviteEmailProps) => {
  const previewText = `${ejecutivoName} de Gard Security te ha enviado una propuesta comercial`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header con logo */}
          <Section style={header}>
            <Img
              src="https://opai.gard.cl/Logo%20Gard%20Blanco.png"
              width="180"
              alt="Gard Security"
              style={logo}
            />
          </Section>

          {/* Contenido principal */}
          <Section style={content}>
            <Heading style={h1}>Hola {contactName}</Heading>

            <Text style={text}>
              <strong>{ejecutivoName}</strong> de Gard Security te ha enviado
              una propuesta comercial. Accede a tu portal para revisarla.
            </Text>

            {/* Credenciales de acceso */}
            <Section style={credentialsBox}>
              <Text style={credentialsTitle}>Tus credenciales de acceso</Text>

              <Text style={credentialLabel}>Correo electrónico</Text>
              <Text style={credentialValue}>{email}</Text>

              <Text style={credentialLabel}>PIN</Text>
              <Text style={credentialValue}>{pin}</Text>
            </Section>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Button style={button} href={portalUrl}>
                Acceder al portal
              </Button>
            </Section>

            <Text style={textSmall}>
              O copia y pega este enlace en tu navegador:
              <br />
              <Link href={portalUrl} style={link}>
                {portalUrl}
              </Link>
            </Text>

            <Hr style={hr} />

            {/* Que encontraras */}
            <Text style={sectionTitle}>
              En tu portal encontraras:
            </Text>
            <Text style={featureText}>
              <strong>Cotizaciones</strong> — Revisa y aprueba las propuestas
              comerciales preparadas para {companyName}.
            </Text>
            <Text style={featureText}>
              <strong>Preview del servicio</strong> — Conoce en detalle la
              solucion de seguridad propuesta.
            </Text>
            <Text style={featureText}>
              <strong>Chat con ejecutivo</strong> — Comunicate directamente con
              tu ejecutivo para resolver dudas.
            </Text>

            <Hr style={hr} />

            <Text style={signature}>
              Saludos cordiales,
              <br />
              <strong>{ejecutivoName}</strong>
              <br />
              Gard Security
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              <Link href="https://www.gard.cl" style={footerLink}>
                www.gard.cl
              </Link>
              {' · '}
              <Link href="mailto:comercial@gard.cl" style={footerLink}>
                comercial@gard.cl
              </Link>
            </Text>
            <Text style={footerTextSmall}>
              Este correo fue enviado desde la plataforma comercial de Gard
              Security.
            </Text>
            <Text style={footerTextSmall}>
              &copy; {new Date().getFullYear()} Gard Security. Todos los
              derechos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default PortalProspectoInviteEmail;

// ─── ESTILOS ───────────────────────────────────────────────

const main = {
  backgroundColor: '#0f172a',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#1e293b',
  margin: '0 auto',
  marginTop: '20px',
  marginBottom: '40px',
  padding: '0',
  maxWidth: '600px',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
};

const header = {
  backgroundColor: '#0f172a',
  padding: '30px 40px',
  textAlign: 'center' as const,
};

const logo = {
  margin: '0 auto',
  display: 'block',
};

const content = {
  padding: '40px 40px 32px',
};

const h1 = {
  color: '#f1f5f9',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.3',
  margin: '0 0 20px',
};

const text = {
  color: '#cbd5e1',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const textSmall = {
  color: '#94a3b8',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '16px 0',
};

const credentialsBox = {
  backgroundColor: '#0f172a',
  borderLeft: '4px solid #14b8a6',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '24px 0',
};

const credentialsTitle = {
  color: '#f1f5f9',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 16px',
};

const credentialLabel = {
  color: '#94a3b8',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '12px 0 4px',
};

const credentialValue = {
  color: '#14b8a6',
  fontSize: '18px',
  fontWeight: '700',
  fontFamily: 'monospace',
  margin: '0 0 8px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#14b8a6',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  boxShadow: '0 4px 12px rgba(20, 184, 166, 0.3)',
};

const link = {
  color: '#14b8a6',
  textDecoration: 'underline',
  wordBreak: 'break-all' as const,
};

const sectionTitle = {
  color: '#f1f5f9',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const featureText = {
  color: '#cbd5e1',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 10px',
};

const signature = {
  color: '#cbd5e1',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '24px 0 0',
};

const hr = {
  borderColor: '#334155',
  margin: '24px 0',
};

const footer = {
  backgroundColor: '#0f172a',
  padding: '24px 40px',
  borderTop: '1px solid #334155',
};

const footerText = {
  color: '#94a3b8',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 12px',
  textAlign: 'center' as const,
};

const footerLink = {
  color: '#64748b',
  textDecoration: 'none',
};

const footerTextSmall = {
  color: '#64748b',
  fontSize: '12px',
  lineHeight: '1.4',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};
