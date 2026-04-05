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
} from '@react-email/components';

interface UserInvitationEmailProps {
  inviterName: string;
  inviteeEmail: string;
  role: string;
  activationUrl: string;
  expiresInHours?: number;
  // Tenant branding props
  brandName?: string;
  brandNameUpper?: string;
  logoUrl?: string;
  website?: string;
  emailContact?: string;
  platformName?: string;
}

export default function UserInvitationEmail({
  inviterName = 'El equipo',
  inviteeEmail = 'usuario@ejemplo.com',
  role = 'admin',
  activationUrl = '',
  expiresInHours = 48,
  brandName = 'OPAI',
  brandNameUpper = 'OPAI',
  logoUrl = '',
  website = '',
  emailContact = '',
  platformName = 'OPAI',
}: UserInvitationEmailProps) {
  const roleNames: Record<string, string> = {
    owner: 'Propietario',
    admin: 'Administrador',
    editor: 'Editor',
    solo_documentos: 'Solo Documentos',
    solo_crm: 'Solo CRM',
    solo_ops: 'Solo Ops',
    solo_payroll: 'Solo Payroll',
    viewer: 'Visualizador',
  };

  return (
    <Html>
      <Head />
      <Preview>Has sido invitado a {platformName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={logoUrl}
              width="120"
              height="40"
              alt={brandName}
            />
          </Section>

          <Section style={content}>
            <Heading style={h1}>Bienvenido a {platformName}</Heading>

            <Text style={text}>
              <strong>{inviterName}</strong> te ha invitado a unirte al equipo
              de {platformName}.
            </Text>

            <Section style={infoBox}>
              <Text style={infoLabel}>Cuenta de correo:</Text>
              <Text style={infoValue}>{inviteeEmail}</Text>

              <Text style={infoLabel}>Rol asignado:</Text>
              <Text style={infoValue}>{roleNames[role] || role}</Text>
            </Section>

            <Text style={text}>
              Para comenzar, necesitas activar tu cuenta y crear una contraseña.
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={activationUrl}>
                Activar mi cuenta
              </Button>
            </Section>

            <Text style={textSmall}>
              O copia este enlace en tu navegador:
              <br />
              <Link href={activationUrl} style={link}>
                {activationUrl}
              </Link>
            </Text>

            <Text style={textSmall}>
              <strong>Importante:</strong> Este enlace expira en {expiresInHours}{' '}
              horas.
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} {brandName}
              <br />
              <Link href={website} style={footerLink}>
                {website.replace(/^https?:\/\//, '')}
              </Link>
              {' · '}
              <Link href={`mailto:${emailContact}`} style={footerLink}>
                {emailContact}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Estilos
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  marginTop: '40px',
  marginBottom: '40px',
  borderRadius: '8px',
  overflow: 'hidden',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
};

const header = {
  backgroundColor: '#1e3a5f',
  padding: '30px',
  textAlign: 'center' as const,
};

const content = {
  padding: '40px',
};

const h1 = {
  color: '#1e3a5f',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.3',
  margin: '0 0 20px',
};

const text = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const textSmall = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '20px 0',
};

const infoBox = {
  backgroundColor: '#f9fafb',
  padding: '20px',
  borderRadius: '6px',
  margin: '20px 0',
};

const infoLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '12px 0 4px',
};

const infoValue = {
  color: '#1e3a5f',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#00d4aa',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
};

const link = {
  color: '#00d4aa',
  textDecoration: 'underline',
  wordBreak: 'break-all' as const,
};

const footer = {
  backgroundColor: '#f9fafb',
  padding: '24px',
  textAlign: 'center' as const,
  borderTop: '1px solid #e5e7eb',
};

const footerText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
};

const footerLink = {
  color: '#1e3a5f',
  textDecoration: 'none',
};
