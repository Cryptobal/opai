/**
 * Email Template: Presentation Email
 * 
 * Template profesional para envío de presentaciones
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

interface PresentationEmailProps {
  recipientName: string;
  companyName: string;
  subject: string;
  presentationUrl: string;
  quoteNumber?: string;
  senderName?: string;
  expiryDate?: string;
}

export const PresentationEmail = ({
  recipientName = 'Cliente',
  companyName = 'Tu Empresa',
  subject = 'Propuesta de Servicios',
  presentationUrl = 'https://opai.gard.cl/p/example',
  quoteNumber = '',
  senderName = 'Equipo Comercial',
  expiryDate = '',
}: PresentationEmailProps) => {
  const previewText = `${subject} - Gard Security`;

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
            <Heading style={h1}>
              Hola {recipientName} 👋
            </Heading>

            <Text style={text}>
              Te envío nuestra propuesta para <strong>{companyName}</strong>.
            </Text>

            <Text style={text}>
              Hemos preparado una presentación personalizada con todos los detalles de nuestra solución para tus necesidades de seguridad.
            </Text>

            {/* Box de información */}
            <Section style={infoBox}>
              <Text style={infoTitle}>📋 Detalles de la Propuesta</Text>
              <Text style={infoText}>
                <strong>Asunto:</strong> {subject}
              </Text>
              {quoteNumber && (
                <Text style={infoText}>
                  <strong>N° Cotización:</strong> {quoteNumber}
                </Text>
              )}
              {expiryDate && (
                <Text style={infoText}>
                  <strong>Válida hasta:</strong> {expiryDate}
                </Text>
              )}
            </Section>

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Button style={button} href={presentationUrl}>
                📄 Ver Propuesta Completa
              </Button>
            </Section>

            <Text style={textSmall}>
              O copia y pega este enlace en tu navegador:
              <br />
              <Link href={presentationUrl} style={link}>
                {presentationUrl}
              </Link>
            </Text>

            <Hr style={hr} />

            <Text style={text}>
              Si tienes alguna pregunta o necesitas más información, no dudes en contactarnos. Estamos para ayudarte.
            </Text>

            <Text style={signature}>
              Saludos cordiales,
              <br />
              <strong>{senderName}</strong>
              <br />
              Gard Security
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              📞 +56 98 230 7771  ·  ✉️ comercial@gard.cl  ·  🌐 www.gard.cl
            </Text>
            <Text style={footerTextSmall}>
              Este correo fue enviado desde Gard Docs, nuestra plataforma de presentaciones comerciales.
            </Text>
            <Text style={footerTextSmall}>
              © {new Date().getFullYear()} Gard Security. Todos los derechos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default PresentationEmail;

// ─── ESTILOS ───────────────────────────────────────────────

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  marginTop: '20px',
  marginBottom: '40px',
  padding: '0',
  maxWidth: '600px',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
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
  color: '#1e293b',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.3',
  margin: '0 0 20px',
};

const text = {
  color: '#475569',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const textSmall = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '16px 0',
};

const infoBox = {
  backgroundColor: '#f1f5f9',
  borderLeft: '4px solid #14b8a6',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '24px 0',
};

const infoTitle = {
  color: '#0f172a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const infoText = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '1.5',
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

const signature = {
  color: '#475569',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '24px 0 0',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '24px 0',
};

const footer = {
  backgroundColor: '#f8fafc',
  padding: '24px 40px',
  borderTop: '1px solid #e2e8f0',
};

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 12px',
  textAlign: 'center' as const,
};

const footerTextSmall = {
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: '1.4',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};
