import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { getEmailLogoUrl } from "@/lib/emails/site-url";

export type GoogleWorkspaceInviteEmailProps = {
  inviterName: string;
  inviteeName: string;
  companyName?: string;
  gmailUrl: string;
  driveUrl: string;
  calendarUrl: string;
};

export default function GoogleWorkspaceInviteEmail({
  inviterName = "Un administrador",
  inviteeName = "hola",
  companyName = "OPAI",
  gmailUrl = "",
  driveUrl = "",
  calendarUrl = "",
}: GoogleWorkspaceInviteEmailProps) {
  const logoUrl = getEmailLogoUrl();
  const preview = `${inviterName} te invita a conectar Gmail, Drive y Calendar en ${companyName}`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img src={logoUrl} alt="OPAI" width={120} height={32} style={logo} />
          </Section>

          <Heading style={h1}>Conectá tus cuentas de Google</Heading>

          <Text style={text}>
            Hola {inviteeName}, <strong>{inviterName}</strong> te invita a conectar
            tus cuentas de Google en {companyName} para sincronizar correo, archivos
            y calendario con OPAI.
          </Text>

          <Text style={text}>Usá estos enlaces (iniciá sesión en OPAI si te lo pide):</Text>

          <Section style={linkBlock}>
            <Text style={linkLabel}>Gmail</Text>
            <Text style={linkHint}>Enviar y registrar correos del CRM</Text>
            <Button href={gmailUrl} style={button}>
              Conectar Gmail
            </Button>
          </Section>

          <Section style={linkBlock}>
            <Text style={linkLabel}>Google Drive</Text>
            <Text style={linkHint}>
              Espejo documental (requiere rol owner o admin)
            </Text>
            <Button href={driveUrl} style={button}>
              Conectar Drive
            </Button>
          </Section>

          <Section style={linkBlock}>
            <Text style={linkLabel}>Google Calendar</Text>
            <Text style={linkHint}>Sincronizar visitas y licitaciones</Text>
            <Button href={calendarUrl} style={button}>
              Conectar Calendar
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footnote}>
            Si un botón no funciona, copiá el enlace:{" "}
            <Link href={gmailUrl} style={footnoteLink}>
              Gmail
            </Link>
            {" · "}
            <Link href={driveUrl} style={footnoteLink}>
              Drive
            </Link>
            {" · "}
            <Link href={calendarUrl} style={footnoteLink}>
              Calendar
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#0c1222",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: "32px 0",
};
const container = {
  backgroundColor: "#111827",
  borderRadius: "12px",
  maxWidth: "560px",
  margin: "0 auto",
  padding: "0",
  border: "1px solid #1e293b",
};
const header = {
  backgroundColor: "#0f172a",
  borderRadius: "12px 12px 0 0",
  padding: "20px 28px",
};
const logo = { display: "block" as const };
const h1 = {
  color: "#f1f5f9",
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "8px 0 12px",
  padding: "20px 28px 0",
};
const text = {
  color: "#94a3b8",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 12px",
  padding: "0 28px",
};
const linkBlock = {
  padding: "12px 28px",
};
const linkLabel = {
  color: "#f1f5f9",
  fontSize: "14px",
  fontWeight: "600" as const,
  margin: "0 0 4px",
};
const linkHint = {
  color: "#64748b",
  fontSize: "13px",
  margin: "0 0 10px",
};
const button = {
  backgroundColor: "#00d4aa",
  color: "#0f172a",
  borderRadius: "8px",
  padding: "10px 20px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: "600" as const,
};
const hr = {
  borderColor: "#1e293b",
  margin: "8px 0 0",
};
const footnote = {
  color: "#475569",
  fontSize: "12px",
  lineHeight: "1.5",
  padding: "16px 28px",
  margin: "0",
};
const footnoteLink = {
  color: "#00d4aa",
  textDecoration: "underline",
};
